import os
import io
import wave
import logging
from flask import Flask, request, jsonify
from google.cloud import speech
from google.cloud.speech import SpeechClient
import datetime

# 환경 변수 및 로그 설정
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = './keen-virtue-441101-s6-629f43560920.json'  # Google Cloud 인증 파일
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

app = Flask(__name__)
speech_client = SpeechClient()  # Google STT 클라이언트 생성

# 오디오 데이터를 WAV 파일로 저장하는 함수
def save_audio_to_wav(audio_data, filename):
    logger.debug("Saving audio data to WAV file...")
    with wave.open(filename, 'wb') as wf:
        wf.setnchannels(1)  # 모노 채널
        wf.setsampwidth(2)  # 16-bit PCM
        wf.setframerate(16000)  # 샘플링 레이트 16000Hz
        wf.writeframes(audio_data)

# Google STT로 파일을 전송하여 텍스트로 변환하는 함수
def transcribe_audio_file(wav_file_path):
    try:
        logger.debug("Transcribing audio file...")
        with io.open(wav_file_path, "rb") as audio_file:
            content = audio_file.read()
        
        audio = speech.RecognitionAudio(content=content)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code="ko-KR",
        )

        response = speech_client.recognize(config=config, audio=audio)
        
        # 변환된 텍스트 출력
        transcripts = [result.alternatives[0].transcript for result in response.results]
        full_transcript = ' '.join(transcripts)
        logger.debug(f"Transcript: {full_transcript}")
        return full_transcript
    except Exception as e:
        logger.error(f"STT 오류 발생: {e}")
        return None

# WebSocket 데이터를 수신하고 WAV 파일로 저장 후 STT 변환하는 함수
@app.route('/webhook/audio', methods=['POST'])
def process_audio():
    try:
        # WebSocket으로 전송된 오디오 데이터를 수신
        audio_data = request.data
        timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        wav_file_path = f"./audio_{timestamp}.wav"

        # 오디오 데이터를 WAV 파일로 저장
        save_audio_to_wav(audio_data, wav_file_path)

        # 저장된 WAV 파일을 Google STT로 전송하여 텍스트 변환
        transcript = transcribe_audio_file(wav_file_path)
        
        if transcript:
            return jsonify({"transcript": transcript}), 200
        else:
            return jsonify({"error": "음성 인식 실패"}), 500

    except Exception as e:
        logger.error("오디오 처리 중 오류 발생", exc_info=True)
        return jsonify({"error": "오디오 처리 실패"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
