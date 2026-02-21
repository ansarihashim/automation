import os
import json
from datetime import datetime

STORAGE_DIR = "app/storage/batches"

class BatchService:
    def list_batches(self):
        """List all batches — only reads batches that have a meta.json (new format)."""
        if not os.path.exists(STORAGE_DIR):
            return []

        batches = []
        for folder in sorted(os.listdir(STORAGE_DIR), reverse=True):
            meta_path = os.path.join(STORAGE_DIR, folder, "meta.json")
            if not os.path.exists(meta_path):
                continue
            try:
                with open(meta_path, "r") as f:
                    data = json.load(f)
                batches.append(data)
            except Exception as e:
                print(f"Error loading meta for {folder}: {e}")

        # Sort newest first by created_at ISO string
        batches.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return batches
    
    def get_batch(self, batch_id: str):
        """Get full batch data by ID"""
        batch_dir = os.path.join(STORAGE_DIR, batch_id)
        summary_path = os.path.join(batch_dir, "summary.json")
        
        if not os.path.exists(summary_path):
            raise FileNotFoundError(f"Batch {batch_id} not found")
        
        with open(summary_path, "r") as f:
            return json.load(f)
    
    def update_batch(self, batch_data: dict):
        """Save updated batch data"""
        batch_id = batch_data.get("batch_id")
        batch_dir = os.path.join(STORAGE_DIR, batch_id)
        summary_path = os.path.join(batch_dir, "summary.json")
        
        with open(summary_path, "w") as f:
            json.dump(batch_data, f, indent=4)
    
    def get_batch_files(self, batch_id: str):
        """Get file paths for a batch (new folder structure)."""
        batch_dir = os.path.join(STORAGE_DIR, batch_id)
        return {
            "master":    os.path.join(batch_dir, "raw", "master.xlsx"),
            "email":     os.path.join(batch_dir, "raw", "email_mapping.xlsx"),
            "processed": os.path.join(batch_dir, "processed", "processed_master.xlsx"),
            "meta":      os.path.join(batch_dir, "meta.json"),
        }
