import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

APP_NAME = os.getenv("APP_NAME", "Kiirus Automation")
ENV = os.getenv("ENV", "development")

# AWS SES Configuration
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
SES_SENDER_EMAIL = os.getenv("SES_SENDER_EMAIL")
SES_SENDER_NAME = os.getenv("SES_SENDER_NAME", "Kiirus Xpress")

# MongoDB Configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")

# JWT Configuration
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_HOURS = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "24"))

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")

# MIS Email — mandatory CC recipients for every outbound MIS report
MIS_CC_EMAILS: list[str] = [
    os.getenv("MIS_CC_1", "sushil.katrale@kiirusxpress.com"),
    os.getenv("MIS_CC_2", "harshal.patil@kiirusxpress.com"),
]

# Support contact shown in outbound MIS emails
SUPPORT_EMAIL: str = os.getenv("SUPPORT_EMAIL", "customer.support@kiirusxpress.com")

# Support phone numbers shown in outbound MIS emails
SHIPMENT_QUERY_PHONE: str = os.getenv("SHIPMENT_QUERY_PHONE", "9921002224")
PICKUP_QUERY_PHONE: str = os.getenv("PICKUP_QUERY_PHONE", "9921002229")

# Emails that are always granted admin + write + active on every login.
# No DB migration needed — enforced at login time.
AUTO_ADMIN_EMAILS: frozenset[str] = frozenset({
    "sushil.katrale@kiirusxpress.com",
    "harshal.patil@kiirusxpress.com",
})
