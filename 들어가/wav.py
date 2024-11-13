from gtts import gTTS
from pydub import AudioSegment

# TTS 생성
text = "제발 이제 성공 좀 하자 으아아악 그만 하고 싶다고 제발 더 이상 스탑."
tts = gTTS(text=text, lang='ko')

# 임시 MP3 파일로 저장
tts.save("temp.mp3")

# MP3 파일을 불러와서 WAV 파일로 변환 (16kHz로 설정)
sound = AudioSegment.from_mp3("temp.mp3")
sound = sound.set_frame_rate(16000)  # 16,000 Hz로 샘플링 레이트 변환
sound.export("test2.wav", format="wav")

print("test2.wav 파일이 16,000 Hz로 생성되었습니다.")
