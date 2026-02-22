from fastapi import APIRouter, HTTPException, Depends
from app.services.email_service import AmazonSESEmailService
from app.config import settings
from app.auth.dependencies import require_admin
from app.models.user_model import CurrentUser

router = APIRouter()
email_service = AmazonSESEmailService()

@router.get("/test")
async def test_ses_connection(current_user: CurrentUser = Depends(require_admin)):
    """Test SES connection and configuration"""
    try:
        # Print configuration for debugging
        print("\n🔍 SES Configuration Check:")
        print(f"   Region: {settings.AWS_REGION}")
        print(f"   Sender Email: {settings.SES_SENDER_EMAIL}")
        print(f"   Sender Name: {settings.SES_SENDER_NAME}")
        print(f"   Access Key ID: {settings.AWS_ACCESS_KEY_ID[:10]}...")
        
        # Try to send a test email to the sender (should work in sandbox if sender is verified)
        test_customer = {
            "customer_name": "Test Customer",
            "customer_email": settings.SES_SENDER_EMAIL,  # Send to self
            "shipment_count": 1,
            "total_parcels": 5,
            "total_weight": 10.5,
            "latest_dispatch": "2026-02-17",
            "pending_payments": 0
        }
        
        result = email_service.send_email(test_customer)
        
        return {
            "status": "success",
            "message": "Test email sent successfully",
            "sender": settings.SES_SENDER_EMAIL,
            "recipient": settings.SES_SENDER_EMAIL,
            "region": settings.AWS_REGION,
            "note": "If you received this email, SES is configured correctly"
        }
    except Exception as e:
        error_msg = str(e)
        print(f"\n❌ SES Test Failed: {error_msg}\n")
        
        # Return detailed error for debugging
        return {
            "status": "failed",
            "error": error_msg,
            "sender": settings.SES_SENDER_EMAIL,
            "region": settings.AWS_REGION,
            "troubleshooting": {
                "check_sender_verification": "Ensure sender email is verified in AWS SES",
                "check_sandbox_mode": "If in sandbox, recipient must also be verified",
                "check_credentials": "Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY",
                "check_region": "Ensure AWS_REGION matches your SES configuration"
            }
        }
