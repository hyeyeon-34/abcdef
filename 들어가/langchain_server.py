from flask import Flask, request, jsonify
from langchain_openai import OpenAI
import os
from dotenv import load_dotenv
from flask_cors import CORS
import logging

# 로깅 설정
logging.basicConfig(level=logging.INFO)

# 환경 변수 로드
load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# OpenAI API 키로 LangChain 설정
openai_api_key = os.getenv("OPENAI_API_KEY")
llm = OpenAI(api_key=openai_api_key, temperature=0.5, max_tokens=50)  # 모델 파라미터 조정
print("OpenAI API Key:", os.getenv("OPENAI_API_KEY"))
print("GOOGLE_APPLICATION_CREDENTIALS:", os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
@app.route('/')
def home():
    return "Hello, Flask!"

@app.route('/generate_response', methods=['POST'])
def generate_response():
    app.logger.info(f"Received request with method: {request.method} and data: {request.json}")
    data = request.json
    input_text = data.get('text')

    if not input_text:
        return jsonify({'error': 'No text provided'}), 400  # 400 Bad Request

    # LangChain을 사용하여 응답 생성
    try:
        # 프롬프트에 지시어 추가
        input_text = "간단하고 대화형으로 응답해 주세요: " + input_text
        response_text = llm.invoke(input_text)
        app.logger.info(f"LangChain 응답: {response_text}")

        # 불필요한 키워드 및 문자 전처리
        if any(keyword in response_text for keyword in ["MIMEText", "smtplib", "attachment"]):
            response_text = "일반적인 답변을 제공할 수 없습니다."

        clean_response = response_text.replace(";", "").replace("\n", "").strip()  # 전처리
        return jsonify({'response': clean_response})
    except Exception as e:
        app.logger.error(f"Error while generating response: {str(e)}")  # 오류 로그
        return jsonify({'error': str(e)}), 500  # 500 Internal Server Error

if __name__ == '__main__':
    app.run(port=5000, debug=True)  # debug=True로 설정하여 코드 변경 시 자동으로 서버가 재시작되도록 함
