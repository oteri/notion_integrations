from typing import Optional
import uvicorn

from fastapi import FastAPI, Query
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

origins = [
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
		expose_headers=["Pagination-Count", "Link"],
)

@app.get("/callback")
async def callback(code: Optional[str] = Query(None)):
    if code:
        # Process the code here
        return {"message": "Code received", "code": code}
    else:
        return {"message": "No code provided"}









    

if __name__ == "__main__":
    get_access_token(client_id='78u1uscjv50fks',
                     client_secret='WPL_AP1.0R8zKTKaY8McRayy.UKALIw==', 
                     redirect_uri='http://localhost:8000/callback' 
                     )
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
        use_colors=True,
    )