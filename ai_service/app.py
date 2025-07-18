from fastapi import FastAPI

app = FastAPI()

@app.get("/status")
def read_status():
    return {"status": "ok"}
