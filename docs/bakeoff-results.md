# Voice bake-off results

Run: `npm run bakeoff`. Score 1–5 per note (product names, money/numbers, landmarks), then set `ASR_PROVIDER` to the winner.

| Note | Muse Voice Transcribe | Muse Spark Open | Score transcribe | Score spark-open |
|---|---|---|---|---|
| 06.wav | Il y a des produits qui تبيعو فها | I don't have an audio file to transcribe in this chat - no audio was attached that I can listen to.

If you upload the audio file or provide a link to it, I can help transcribe the Tunisian Derja as spoken. You can also paste a rough version of what you hear and I can help clean it up into accurate Derja transcription.

Feel free to upload the clip and let me know if you'd like the transcript in Arabic script, Latin script, or both. |  |  |

**Preliminary decision (2026-10-28, 1 of 6 notes):** Muse Voice Transcribe wins — Spark Open (`muse-spark-open-1026`) did not ingest the `input_audio` content part via Baseten's OpenAI-compatible endpoint ("no audio was attached"), so `ASR_PROVIDER=transcribe` stays. Re-run with all 6 notes to finalize; investigate Baseten's audio input format only if an ASR fallback is needed.
