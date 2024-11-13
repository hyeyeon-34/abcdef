from google.cloud import speech
import io
import os

# Google Cloud 인증 설정
os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = './stt.json'

def transcribe_wav_file(wav_file_path):
    client = speech.SpeechClient()

    # WAV 파일을 바이너리로 로드
    with io.open(wav_file_path, "rb") as audio_file:
        content = audio_file.read()

    # STT 요청 설정
    audio = speech.RecognitionAudio(content=content)
    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,  # WAV 파일의 기본 인코딩
        sample_rate_hertz=24000,  # 파일 샘플링 레이트
        language_code="ko-KR",  # 한국어
    )

    # STT 요청 보내기
    response = client.recognize(config=config, audio=audio)

    # 변환된 텍스트 출력
    for result in response.results:
        print("Transcript: {}".format(result.alternatives[0].transcript))

# WAV 파일 경로 설정 후 호출
transcribe_wav_file("./test2.wav")
