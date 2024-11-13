from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, Tuple
import requests
import logging
import uuid

app = FastAPI()
logging.basicConfig(level=logging.DEBUG)

class ChatbotManager:
    def __init__(self):
        self.active_connections: Dict[str, Tuple[WebSocket, str]] = {}

    async def connect(self, websocket: WebSocket) -> str:
        await websocket.accept()
        session_id = str(uuid.uuid4())
        self.active_connections[session_id] = websocket
        return session_id

    def disconnect(self, session_id: str):
        self.active_connections.pop(session_id, None)

    async def send_response(self, session_id: str, message: str):
        websocket = self.active_connections.get(session_id)
        if websocket:
            response = requests.post("http://localhost:5001/generate_response", json={"text": message})
            bot_response = response.json().get("response", "응답을 생성할 수 없습니다.")
            await websocket.send_json({"sender": "bot", "message": bot_response})

manager = ChatbotManager()

@app.websocket("/ws/chatbot")
async def websocket_endpoint(websocket: WebSocket):
    session_id = await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            message = data.get("message", "")
            await manager.send_response(session_id, message)
    except WebSocketDisconnect:
        manager.disconnect(session_id)
