from pydub import AudioSegment

# 오디오 파일 경로 지정
audio_file = "received_audio.wav"

# 오디오 파일 불러오기
audio = AudioSegment.from_file(audio_file, format="wav")

# 오디오 파일 정보 출력
print("Channels:", audio.channels)
print("Sample Width (bytes):", audio.sample_width)
print("Frame Rate (Hz):", audio.frame_rate)
print("Frame Width (bytes):", audio.frame_width)
print("Sample Rate:", audio.frame_rate, "Hz")
print("Bit Depth:", audio.sample_width * 8, "bits")  # Sample width를 비트로 변환
