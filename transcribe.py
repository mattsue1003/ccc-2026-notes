"""Transcribe the two livestream recordings with mlx-whisper in 20-minute chunks.

Resumable: each chunk is saved to raw/chunks/<id>_<n>.json; finished chunks are skipped.
Usage: python3 transcribe.py
"""
import json, os, subprocess, sys
import mlx_whisper

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw")
CH = os.path.join(RAW, "chunks")
os.makedirs(CH, exist_ok=True)
MODEL = "mlx-community/whisper-large-v3-turbo"
CHUNK = 1200  # seconds
VIDEOS = {"a68KpkrjF9A": 26890, "PiKwuQceCC0": 28787}
PROMPT = ("以下是繁體中文的研討會演講逐字稿，主題為台灣社區整合照顧、長照3.0、健康台灣、居家醫療、"
          "醫療與社區協作、醫照共案、復健病房試辦計畫、重症兒童照顧、衛生福利部、健保署、社區關懷據點、"
          "失智共照、出院準備、在宅醫療、社會福利總盟。")

for vid, dur in VIDEOS.items():
    src = os.path.join(RAW, vid + ".webm")
    n = 0
    while n * CHUNK < dur:
        out = os.path.join(CH, f"{vid}_{n:02d}.json")
        if os.path.exists(out):
            n += 1
            continue
        wav = os.path.join(CH, "tmp.wav")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(n * CHUNK), "-t", str(CHUNK),
                        "-i", src, "-ac", "1", "-ar", "16000", wav], check=True)
        r = mlx_whisper.transcribe(wav, path_or_hf_repo=MODEL, language="zh", initial_prompt=PROMPT,
                                   condition_on_previous_text=False, no_speech_threshold=0.6,
                                   compression_ratio_threshold=2.2, verbose=None)
        segs = [[round(s["start"] + n * CHUNK, 2), round(s["end"] + n * CHUNK, 2), s["text"].strip()]
                for s in r["segments"] if s["text"].strip()]
        with open(out, "w", encoding="utf-8") as f:
            json.dump(segs, f, ensure_ascii=False)
        os.remove(wav)
        print(vid, n, len(segs), flush=True)
        n += 1
print("ALL DONE", flush=True)
