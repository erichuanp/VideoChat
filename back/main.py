# back/main.py
import os
import asyncio
import ssl
import websockets
from config import HOST, PORT
from handlers import connection_handler

async def main():
    # 获取当前文件所在目录
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # 构造证书的绝对路径
    cert_path = os.path.join(current_dir, '..', 'front', 'certs', 'cert.pem')
    key_path  = os.path.join(current_dir, '..', 'front', 'certs', 'key.pem')

    # 输出调试信息，确认文件路径是否正确
    print("证书路径:", cert_path)
    print("密钥路径:", key_path)

    # 创建 SSL 上下文
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain(certfile=cert_path, keyfile=key_path)

    async with websockets.serve(connection_handler, HOST, PORT, ssl=ssl_context):
        print(f"信令服务器已启动，监听 {HOST}:{PORT} (WSS)")
        await asyncio.Future()  # 保持服务器运行

if __name__ == "__main__":
    asyncio.run(main())
