import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // File uploads (PO / renewal / agreement documents) post the file bytes
      // through a Server Action as FormData. Next's default cap is 1 MB, which
      // real PDFs routinely exceed — a larger file used to fail with a
      // full-page "Body exceeded 1 MB limit" error. Raise the ceiling to 5 MB
      // so typical documents upload fine. The app also validates the file size
      // client- and server-side (see the agreement form) so oversized files get
      // a clear message rather than a crash. Note: Vercel's platform request
      // limit is ~4.5 MB, so the app-level cap is kept at 4 MB.
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
