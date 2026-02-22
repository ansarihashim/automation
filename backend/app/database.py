"""
MongoDB connection setup using Motor (async driver).
"""
import motor.motor_asyncio
from app.config.settings import MONGODB_URL

client: motor.motor_asyncio.AsyncIOMotorClient = None
db = None


async def connect_to_mongo():
    global client, db
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGODB_URL)
    db = client["kiirus_automation"]
    # Ensure unique index on email
    await db["users"].create_index("email", unique=True)
    # Batch persistence indexes
    await db["batches"].create_index("batch_id", unique=True)
    await db["batches"].create_index("created_at")
    # Email log indexes
    await db["email_logs"].create_index("batch_id")
    await db["email_logs"].create_index("sent_at")
    print("✅ Connected to MongoDB")


async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("🔌 MongoDB connection closed")


def get_db():
    return db
