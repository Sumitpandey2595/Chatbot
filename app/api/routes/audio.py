import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from app.services.audio_service import audio_service
from app.core.config import settings

router = APIRouter()

class SynthesizeRequest(BaseModel):
    text: str

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Accepts an audio file and returns text"""
    # Save file temporarily
    os.makedirs(settings.STORAGE_PATH, exist_ok=True)
    temp_path = os.path.join(settings.STORAGE_PATH, f"temp_{uuid.uuid4().hex}_{file.filename}")
    
    try:
        with open(temp_path, "wb") as buffer:
            buffer.write(await file.read())
            
        text = await audio_service.transcribe_audio(temp_path)
        return {"text": text}
    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/synthesize")
async def synthesize_audio(request: SynthesizeRequest):
    """Accepts text and returns an audio file path/URL"""
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    file_path = await audio_service.synthesize_speech(request.text)
    filename = os.path.basename(file_path)
    # Return URL to access the audio (assuming we'll serve files or provide a download endpoint)
    return {"audio_url": f"/api/audio/download/{filename}"}

@router.get("/download/{filename}")
async def download_audio(filename: str):
    """Serve the generated audio file"""
    file_path = os.path.join(settings.STORAGE_PATH, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
        
    return FileResponse(file_path, media_type="audio/mpeg", filename=filename)
