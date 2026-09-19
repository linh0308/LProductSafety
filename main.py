from contextlib import asynccontextmanager
from pathlib import Path
import uvicorn
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from backend.DB import engine
from backend.store import AppBase, SessionLocal
from backend.excel_import import import_sources
from backend.api import router as api_router
from backend.dashboard import router as dashboard_router
from login import router as login_router, current_user

BASE_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app):
    AppBase.metadata.create_all(engine)
    with SessionLocal() as db:
        import_sources(db)
    yield


app = FastAPI(title="NFV2 Product Safety", lifespan=lifespan, docs_url=None, redoc_url=None)
app.mount('/static', StaticFiles(directory=BASE_DIR/'static'), name='static')
app.include_router(login_router)
app.include_router(api_router)
app.include_router(dashboard_router)


@app.middleware('http')
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'same-origin'
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


@app.exception_handler(SQLAlchemyError)
async def database_error(request, error):
    import logging
    logging.getLogger('product-safety').error('Database operation failed: %s', type(error).__name__)
    return JSONResponse({'detail':'Không truy cập được DB. Kiểm tra kết nối máy chủ rồi thử lại.'},status_code=503)


@app.get('/', include_in_schema=False)
def serve_frontend(request: Request):
    from fastapi import HTTPException
    with SessionLocal() as db:
        try:
            current_user(request, db)
        except HTTPException:
            return RedirectResponse('/login', status_code=303)
    return FileResponse(BASE_DIR/'backend'/'templates'/'index.html')


@app.get('/favicon.ico', include_in_schema=False)
def favicon():
    return FileResponse(BASE_DIR/'static'/'logo.png', media_type='image/png')



def run():
    import argparse
    import socket
    import threading
    import time
    import webbrowser

    parser = argparse.ArgumentParser(description="Product Safety web server")
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=8888)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error('Port must be between 1 and 65535.')
    family = socket.AF_INET6 if ':' in args.host else socket.AF_INET
    listener = socket.socket(family, socket.SOCK_STREAM)
    if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    try:
        listener.bind((args.host, args.port))
        listener.listen(128)
    except OSError as exc:
        listener.close()
        if exc.errno in (48, 98, 10048) or getattr(exc, 'winerror', None) == 10048:
            print(f'Cong {args.port} dang duoc su dung. Mot phien web co the dang chay.')
            print(f'Mo http://localhost:{args.port} de kiem tra. Dung phien cu bang Ctrl+C trong terminal da chay no de nap code moi.')
            print('Hoac chon cong khac: python main.py --port 8889')
            return 1
        raise
    server = uvicorn.Server(uvicorn.Config(app, host=args.host, port=args.port, reload=False))

    def open_when_ready():
        while not server.started and not server.should_exit:
            time.sleep(0.1)
        if server.started:
            host = 'localhost' if args.host in ('0.0.0.0', '::') else args.host
            if ':' in host:
                host = f'[{host}]'
            webbrowser.open(f'http://{host}:{args.port}')

    if not args.no_browser:
        threading.Thread(target=open_when_ready, daemon=True).start()
    try:
        server.run(sockets=[listener])
    finally:
        listener.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(run())
