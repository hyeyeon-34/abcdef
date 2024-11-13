from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import fitz  # PyMuPDF
import openai
import boto3  # Amazon Polly 사용
from dotenv import load_dotenv
import requests
import time
import jwt

app = Flask(__name__)
CORS(app)
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
VONAGE_APPLICATION_ID = 'e81bc289-d4dd-4d21-b213-f0181d7d2d98'
VONAGE_APPLICATION_PRIVATE_KEY_PATH = '/Users/hyeyeon/Desktop/private7.key'
NGROK_URL = "https://9bea-222-112-27-104.ngrok-free.app"
polly_client = boto3.client(
    "polly",
    region_name=os.getenv("AWS_REGION"),
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)

# 전역 토큰과 만료 시간 변수 초기화
jwt_token = None
jwt_expiration = 0

def initialize_pdf_content():
    pdf_path = "./data/202009_5.이동통신단말기분실보험_약관_7.pdf"
    text = extract_text_from_pdf(pdf_path)
    global pdf_text_chunks
    pdf_text_chunks = split_text(text)

def extract_text_from_pdf(pdf_path):
    with fitz.open(pdf_path) as doc:
        return ''.join([page.get_text() for page in doc])

def split_text(text, chunk_size=4000, overlap=200):
    return [text[i:i + chunk_size] for i in range(0, len(text), chunk_size - overlap)]

def generate_answer_with_openai_requests(prompt):
    headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
    data = {"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": prompt}], "max_tokens": 500}
    response = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=data)
    return response.json()['choices'][0]['message']['content'].strip()

def generate_tts_file(text):
    output_dir = "audio"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    try:
        response = polly_client.synthesize_speech(
            Text=text,
            OutputFormat="mp3",
            VoiceId="Seoyeon",
            SampleRate="16000"
        )
        
        if "AudioStream" in response:
            output_path = f"{output_dir}/output-{int(time.time() * 1000)}.mp3"
            with open(output_path, "wb") as out:
                out.write(response["AudioStream"].read())
            print("음성 파일 저장 완료:", output_path)
            return output_path
        else:
            print("Error: AudioStream이 응답에 없습니다.")
            return None
    except (BotoCoreError, ClientError) as error:
        print(f"Amazon Polly TTS 요청 중 오류 발생: {error}")
        return None

def get_jwt_token():
    global jwt_token, jwt_expiration
    current_time = int(time.time())
    
    # 토큰이 없거나 만료되었으면 새 토큰 생성
    if not jwt_token or current_time >= jwt_expiration:
        with open(VONAGE_APPLICATION_PRIVATE_KEY_PATH, 'rb') as key_file:
            private_key = key_file.read()
        
        jwt_expiration = current_time + 600  # 토큰 유효기간: 10분
        payload = {
            "application_id": VONAGE_APPLICATION_ID,
            "iat": current_time,
            "exp": jwt_expiration
        }
        
        jwt_token = jwt.encode(payload, private_key, algorithm="RS256")
        print("New JWT Token Generated:", jwt_token)
    else:
        print("Using existing JWT Token")
    
    return jwt_token

def play_audio_on_call(call_uuid, audio_filename):
    audio_url = f"{NGROK_URL}/audio/{audio_filename}"
    print("Audio URL:", audio_url)

    token = get_jwt_token()  # 토큰을 가져오거나 필요시 갱신

    url = f"https://api.nexmo.com/v1/calls/{call_uuid}/stream"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "stream_url": [audio_url],
        "loop": 1
    }

    # 요청 보내기
    try:
        response = requests.put(url, headers=headers, json=data)
        if response.status_code == 204:
            print("Audio is now playing on the call.")
        else:
            print(f"Failed to play audio. Status Code: {response.status_code}, Response: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"Error updating call: {e}")

@app.route('/generate_response', methods=['POST'])
def generate_response():
    question = request.json.get("text")
    call_uuid = request.json.get("call_uuid")
    relevant_content = pdf_text_chunks[0]
    input_text = f"질문: {question}\n정보: {relevant_content}"
    response_text = generate_answer_with_openai_requests(input_text)
    audio_path = generate_tts_file(response_text)
    
    if audio_path:
        audio_filename = os.path.basename(audio_path)
        play_audio_on_call(call_uuid, audio_filename)
        audio_url = f"{NGROK_URL}/audio/{audio_filename}"
        return jsonify({'response': response_text, 'audio_url': audio_url})
    else:
        return jsonify({'response': response_text, 'error': '음성 파일 생성에 실패했습니다.'}), 500

@app.route('/audio/<path:filename>', methods=['GET'])
def serve_audio(filename):
    return send_file(f"audio/{filename}", mimetype="audio/mpeg")

if __name__ == '__main__':
    initialize_pdf_content()
    app.run(host='0.0.0.0', port=5001, debug=True)
