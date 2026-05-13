import subprocess
import os
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class CodeUpdate(BaseModel):
    code: str
    filename: str

@app.post("/api/save")
async def save_code(update: CodeUpdate):
    # Ensure testcases directory exists
    os.makedirs("/opt/mulval/testcases/web", exist_ok=True)
    filepath = os.path.join("/opt/mulval/testcases/web", update.filename)
    with open(filepath, "w") as f:
        f.write(update.code)
    return {"status": "success", "path": filepath}

@app.get("/api/run")
async def run_mulval(filename: str):
    input_path = os.path.join("/opt/mulval/testcases/web", filename)
    
    async def event_generator():
        # Clear old output directory to avoid confusion
        os.makedirs("/output", exist_ok=True)
        
        # Build the command
        # We run it via bash to get full environment
        cmd = ["bash", "/opt/mulval/utils/graph_gen.sh", input_path, "-v"]
        
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd="/output",
            env={**os.environ, "MULVALROOT": "/opt/mulval", "PATH": f"{os.environ['PATH']}:/opt/mulval/bin:/opt/mulval/utils"}
        )

        while True:
            line = await process.stdout.readline()
            if not line:
                break
            yield f"data: {line.decode().rstrip()}\n\n"
            
        await process.wait()
        yield f"data: --- FINISHED with exit code {process.returncode} ---\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@app.get("/api/pdf")
async def get_pdf():
    pdf_path = "/output/AttackGraph.pdf"
    if os.path.exists(pdf_path):
        return FileResponse(pdf_path, media_type="application/pdf")
    return {"error": "PDF not found"}

# Serve the static files from the Next.js export (out directory)
if os.path.exists("../frontend/out"):
    app.mount("/", StaticFiles(directory="../frontend/out", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
