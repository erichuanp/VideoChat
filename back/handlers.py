# backend/handlers.py

import json
import asyncio
from router import register_client, unregister_client, broadcast_message

async def connection_handler(websocket, path=None):
    """
    处理单个客户端的 WebSocket 连接。
    
    参数：
    - websocket: 当前连接的 websocket 对象
    - path: 当前请求的路径（如果需要可以通过路径进行路由判断）
    
    TODO:
    - 注册新连接（调用 register_client）
    - 使用 async for 循环不断接收客户端消息
    - 对接收到的消息进行解析（假设消息为 JSON 格式）
    - 调用 broadcast_message 将消息转发给其他客户端
    - 在连接关闭后，调用 unregister_client 移除该连接
    """
    # 注册新客户端连接
    await register_client(websocket)
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
            except json.JSONDecodeError as e:
                print(f"收到非法消息 {e} 已忽略")
                continue

            if data.get('type') == "offer":
                print(f"收到 offer 消息")
            elif data.get('type') == "answer":
                print(f"收到 answer 消息")
            elif data.get('type') == "candidate":
                print(f"收到 candidate 消息")
            elif data.get('type') == "ping":
                continue
                print(f"收到 ping 消息")
            elif data.get('type') == "pong":
                continue
                print(f"收到 pong 消息")
            elif data.get('type') == "delay-report":
                continue
                print(f"收到 delay-report 消息")
            else:
                print(f"收到未知消息 {message}")

            await broadcast_message(websocket, message)
            
    except Exception as e:
        print(f"捕获错误 {e}")

    finally:
        # 断开连接后移除客户端
        await unregister_client(websocket)
