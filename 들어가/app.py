from google.cloud import speech  # Google STT 라이브러리 추가
from google.cloud import texttospeech  # Google TTS 라이브러리 추가
import requests

from flask import Flask, request, jsonify
import os
from dotenv import load_dotenv
import logging

# 환경 변수 로드
load_dotenv()
app = Flask(__name__)
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.DEBUG)
# Google Cloud STT 클라이언트 설정
speech_client = speech.SpeechClient()

# Google Cloud TTS 클라이언트 설정
tts_client = texttospeech.TextToSpeechClient()

# Google API 키 설정
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# 음성 합성 함수 (TTS)
# 
def create_langchain_response(question: str) -> str:
    try:
        # OpenAI API 설정 (환경 변수에서 API 키 로드)
        openai_api_key = os.getenv("OPENAI_API_KEY")
        
        # LLM과 프롬프트 템플릿 설정
        llm = OpenAI(openai_api_key=openai_api_key)
        prompt_template = PromptTemplate(input_variables=["question"], template="Q: {question}\nA:")
        chain = ConversationChain(llm=llm, prompt=prompt_template)
        
        # LangChain을 통해 질문에 대한 응답 생성
        response = chain.run(question)
        return response
    except Exception as e:
        logger.error("Error occurred while generating response with LangChain", exc_info=True)
        return None

@app.route('/generate_response', methods=['POST'])
def generate_response():
    try:
        question = request.json.get("text")
        logger.debug(f"Received question: {question}")
        
        if not question:
            return jsonify({'response': "질문이 제공되지 않았습니다."}), 400
        
        # LangChain을 사용하여 답변 생성
        bot_response = create_langchain_response(question)
        
        if bot_response:
            logger.debug(f"Generated response: {bot_response}")
            
            # 텍스트 음성 합성 (예시로 텍스트를 음성으로 변환)
            response_audio = synthesize_text_to_speech(bot_response)
            if not response_audio:
                return jsonify({'response': "음성 합성 실패"}), 500
            
            return jsonify({'response': bot_response}), 200
        else:
            return jsonify({'response': "응답을 생성할 수 없습니다."}), 500

    except Exception as e:
        logger.error("Error in /generate_response endpoint", exc_info=True)
        return jsonify({'response': "응답을 생성할 수 없습니다."}), 500

# 텍스트 음성 합성 함수 (예시)
def synthesize_text_to_speech(text: str) -> str:
    # 이 부분에서 텍스트를 음성 파일로 변환하는 로직을 구현
    # 예를 들어 Google TTS를 사용하여 음성을 생성
    logger.debug(f"Generating speech for text: {text}")
    # 실제 음성 생성 코드 추가 (예시)
    return "음성 파일 경로"

# 음성 인식 함수 (STT)
def transcribe_speech_to_text(audio_content):
    try:
        audio = speech.RecognitionAudio(content=audio_content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code="ko-KR"
        )

        # STT API 호출
        response = speech_client.recognize(config=config, audio=audio)
        
        # 변환된 텍스트 반환
        return ' '.join([result.alternatives[0].transcript for result in response.results])
    except Exception as e:
        logger.error(f"STT 오류 발생: {e}")
        return None

@app.route('/generate_response', methods=['POST'])
def generate_response():
    try:
        question = request.json.get("text")
        logger.debug(f"Received question: {question}")
        
        # 텍스트 음성 합성
        response_audio = synthesize_text_to_speech(question)
        if not response_audio:
            return jsonify({'response': "음성 합성 실패"}), 500
        
        # WebSocket으로 음성 전송 로직을 여기에 추가 (예: 웹소켓 클라이언트로 전송)
        
        return jsonify({'response': "음성 생성 완료"}), 200

    except Exception as e:
        logger.error("Error in /generate_response endpoint", exc_info=True)
        return jsonify({'response': "응답을 생성할 수 없습니다."}), 500

@app.route('/stt', methods=['POST'])
def stt():
    try:
        audio_content = request.files['audio'].read()  # 오디오 파일 받아오기
        text = transcribe_speech_to_text(audio_content)
        
        if not text:
            return jsonify({'response': "음성 인식 실패"}), 500
        
        return jsonify({'text': text}), 200

    except Exception as e:
        logger.error("STT 오류 발생", exc_info=True)
        return jsonify({'response': "음성 인식 오류"}), 500

# 서버 실행
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)