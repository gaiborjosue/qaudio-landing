export function buildContactMailto({
  name,
  email,
  message,
}: {
  name: string
  email: string
  message: string
}) {
  const body = `Name: ${name.trim()}\r\nEmail: ${email.trim()}\r\n\r\n${message.trim().replace(/\r?\n/g, "\r\n")}`
  return `mailto:info@qaudio.com?subject=${encodeURIComponent("Message to Q Audio")}&body=${encodeURIComponent(body)}`
}
