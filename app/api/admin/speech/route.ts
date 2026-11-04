import { getAdmin } from "@/lib/admin/auth"
import { translateSpeech } from "@/lib/admin/speech-api"

export async function POST(request: Request) {
  return translateSpeech(request, {
    authorize: async () => Boolean(await getAdmin()),
    apiKey: process.env.GROQ_API_KEY,
  })
}
