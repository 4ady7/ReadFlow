# ReadFlow

Turn any PDF into something you can listen to.

```bash
npm install
npm run dev
```

Open http://localhost:3000, upload a PDF, and press Read aloud.

Speech uses a voice already on the device. To use a studio voice instead, copy `.env.example` to `.env.local` and set one provider key. Credentials stay on the server.

PDFs and generated audio are stored in this browser. Nothing is uploaded except text sent to a studio voice when one is configured.
