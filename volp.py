from pyvoip.sip import VoIPClient

# Twilio에서 설정한 SIP 정보
SIP_USERNAME = "my_sip_user"
SIP_PASSWORD = "my_password123"
SIP_SERVER = "my-sip-domain.sip.twilio.com"
TARGET_PHONE_NUMBER = "sip:+821012345678@my-sip-domain.sip.twilio.com"  # 상대방 번호

# VoIPClient 설정 및 호출
client = VoIPClient(SIP_USERNAME, SIP_PASSWORD, SIP_SERVER)
client.call(TARGET_PHONE_NUMBER)