# backend/router.py

# 用于存储所有连接的客户端
clients = set()

async def register_client(websocket):
    """
    注册一个新的客户端连接。
    
    参数：
    - websocket: 当前连接的 websocket 对象
    
    TODO:
    - 将 websocket 添加到 clients 集合中
    """
    clients.add(websocket)
    print("新的客户端已连接")

async def unregister_client(websocket):
    """
    移除断开连接的客户端。
    
    参数：
    - websocket: 当前断开连接的 websocket 对象
    
    TODO:
    - 从 clients 集合中移除 websocket
    """
    try:
        clients.discard(websocket)
    except Exception as e:
        print(f"Error: 移除失败，客户端已断开websocket: {websocket}, {e}")
    print(f"{websocket} 客户端已断开")

async def broadcast_message(sender, message):
    """
    将消息广播给除了 sender 之外的所有已连接客户端。
    
    参数：
    - sender: 发送消息的 websocket 对象
    - message: 要广播的消息数据（字符串格式，一般是 JSON）
    
    TODO:
    - 遍历所有 clients 中的 websocket 对象
    - 对于不等于 sender 的连接，发送消息
    """
    for client in clients:
        if client != sender:
            try:
                await client.send(message)
                print(f"{client} 已发送")
            except Exception as e:
                print(f"Error: 发送失败 Client: {client} sender: {sender} message: {message}， {e}")

