import subprocess
import os
import asyncio
import shutil
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
        if os.path.exists("/output"):
            for item in os.listdir("/output"):
                item_path = os.path.join("/output", item)
                try:
                    if os.path.isfile(item_path) or os.path.islink(item_path):
                        os.unlink(item_path)
                    elif os.path.isdir(item_path):
                        shutil.rmtree(item_path)
                except Exception as e:
                    yield f"data: ⚠️ Warning: Could not clear {item}: {e}\n\n"

        os.makedirs("/output", exist_ok=True)
        
        # --- CVE RESOLUTION STEP ---
        # Scan input_path for vulExists(..., 'CVE-XXXX', ...) and enrich it
        try:
            with open(input_path, "r") as f:
                content = f.read()
            
            import re
            import pymysql
            
            # Find all CVE patterns in single quotes
            cve_ids = re.findall(r"'CVE-\d{4}-\d+'", content)
            cve_ids = [c.strip("'") for c in cve_ids]
            
            if cve_ids:
                yield f"data: 🔍 Resolving properties for {len(cve_ids)} CVEs from local NVD database...\n\n"
                conn = pymysql.connect(host='localhost', user='root', password='root', database='nvd')
                with conn.cursor() as cursor:
                    placeholders = ', '.join(['%s'] * len(cve_ids))
                    cursor.execute(f"SELECT id, rng, lose_types FROM nvd WHERE id IN ({placeholders})", tuple(cve_ids))
                    rows = cursor.fetchall()
                    
                    if rows:
                        enriched_facts = "\n/* Automatically resolved from NVD Database */\n"
                        for row in rows:
                            cve_id, rng_str, lose_str = row
                            # Split multiple ranges/consequences if they exist
                            ranges = rng_str.split(',')
                            losses = lose_str.split(',')
                            for r in ranges:
                                for l in losses:
                                    if r and l:
                                        enriched_facts += f"vulProperty('{cve_id}', {r}, {l}).\n"
                        
                        with open(input_path, "a") as f:
                            f.write(enriched_facts)
                        yield f"data: ✅ Successfully enriched input with {len(rows)} vulnerability properties.\n\n"
                    else:
                        yield f"data: ⚠️ No properties found in DB for these CVEs. Using manual facts only.\n\n"
                conn.close()
        except Exception as e:
            yield f"data: ⚠️ CVE Resolution failed: {e}\n\n"
        # ---------------------------

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

@app.get("/api/svg")
async def get_svg():
    svg_path = "/output/AttackGraph.svg"
    if os.path.exists(svg_path):
        return FileResponse(svg_path, media_type="image/svg+xml")
    return {"error": "SVG not found"}

# Serve the static files from the Next.js export (out directory)
if os.path.exists("../frontend/out"):
    app.mount("/", StaticFiles(directory="../frontend/out", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
