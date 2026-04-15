import type { Request } from 'express';
import { getOptionalEnv } from './env.js';

type EmailContent = { text: string; html?: string }

type TaskDetails = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  due_date: string | null
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const toParagraphs = (value: string) => {
  const lines = value
    .split(/\r?\n/)
    .map((x) => x.trimEnd())
    .filter((x) => x.length > 0)
    .slice(0, 40)

  if (lines.length === 0) return ''
  return lines.map((x) => `<div style="margin:0 0 10px 0">${escapeHtml(x)}</div>`).join('')
}

export const getAppBaseUrl = (req: Request) => {
  const envUrl =
    getOptionalEnv('APP_PUBLIC_URL') ||
    getOptionalEnv('PUBLIC_APP_URL') ||
    getOptionalEnv('APP_URL') ||
    getOptionalEnv('PUBLIC_URL')

  if (envUrl) return envUrl.replace(/\/$/, '')

  const xfProto = req.headers['x-forwarded-proto']
  const proto = (Array.isArray(xfProto) ? xfProto[0] : xfProto) || 'http'
  const xfHost = req.headers['x-forwarded-host']
  const host = (Array.isArray(xfHost) ? xfHost[0] : xfHost) || req.headers.host
  if (host) return `${proto}://${host}`.replace(/\/$/, '')

  return 'http://localhost:5173'
}

export const buildGenericEmail = (input: { subject: string; body: string; url?: string }): EmailContent => {
  const safeSubject = escapeHtml(input.subject)
  const safeUrl = input.url ? escapeHtml(input.url) : ''
  const bodyHtml = toParagraphs(input.body)

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeSubject}</title>
  </head>
  <body style="margin:0;padding:0;background:#0b1220;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1220;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;border-radius:18px;overflow:hidden;background:#0f172a;border:1px solid #1f2937;">
            <tr>
              <td style="padding:20px 22px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#e5e7eb;">
                <div style="font-size:16px;font-weight:700;letter-spacing:0.2px;">${safeSubject}</div>
                <div style="height:12px"></div>
                <div style="font-size:14px;line-height:20px;color:#cbd5e1;">${bodyHtml || '<div style="color:#94a3b8">(sin mensaje)</div>'}</div>
                ${
                  safeUrl
                    ? `<div style="height:18px"></div>
                       <div style="font-size:13px;color:#cbd5e1;">Enlace:</div>
                       <div style="margin-top:6px;"><a href="${safeUrl}" style="color:#60a5fa;word-break:break-all;">${safeUrl}</a></div>`
                    : ''
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = `${input.subject}\n\n${input.body}${input.url ? `\n\nEnlace: ${input.url}` : ''}`

  return { text, html }
}

export const buildTaskAssignmentEmail = (input: {
  projectName: string
  task: TaskDetails
  note: string
  url: string
}): EmailContent => {
  const safeProject = escapeHtml(input.projectName)
  const safeTitle = escapeHtml(input.task.title)
  const safeDesc = input.task.description ? toParagraphs(input.task.description) : ''
  const safeNote = input.note ? toParagraphs(input.note) : ''
  const safeUrl = escapeHtml(input.url)

  const priorityLabel = escapeHtml(input.task.priority)
  const statusLabel = escapeHtml(input.task.status)
  const dueLabel = escapeHtml(input.task.due_date || '—')

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nueva tarea asignada</title>
  </head>
  <body style="margin:0;padding:0;background:#0b1220;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b1220;">
      <tr>
        <td align="center" style="padding:26px 12px;">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;border-radius:20px;overflow:hidden;background:#0f172a;border:1px solid #1f2937;">
            <tr>
              <td style="padding:22px 22px 14px 22px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#e5e7eb;">
                <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">${safeProject}</div>
                <div style="margin-top:10px;font-size:20px;font-weight:750;line-height:26px;">Nueva tarea asignada</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 18px 22px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#e5e7eb;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-radius:16px;overflow:hidden;background:#0b1324;border:1px solid #1f2937;">
                  <tr>
                    <td style="padding:16px 16px 12px 16px;">
                      <div style="font-size:16px;font-weight:720;line-height:22px;color:#f8fafc;">${safeTitle}</div>
                      ${safeDesc ? `<div style="margin-top:8px;font-size:13px;line-height:19px;color:#cbd5e1;">${safeDesc}</div>` : ''}
                      <div style="margin-top:14px;">
                        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:0 8px;">
                          <tr>
                            <td style="font-size:12px;color:#94a3b8;">Prioridad</td>
                            <td align="right" style="font-size:12px;color:#e5e7eb;font-weight:650;">${priorityLabel}</td>
                          </tr>
                          <tr>
                            <td style="font-size:12px;color:#94a3b8;">Estado</td>
                            <td align="right" style="font-size:12px;color:#e5e7eb;font-weight:650;">${statusLabel}</td>
                          </tr>
                          <tr>
                            <td style="font-size:12px;color:#94a3b8;">Vence</td>
                            <td align="right" style="font-size:12px;color:#e5e7eb;font-weight:650;">${dueLabel}</td>
                          </tr>
                        </table>
                      </div>
                    </td>
                  </tr>
                </table>

                ${
                  safeNote
                    ? `<div style="height:14px"></div>
                       <div style="font-size:13px;color:#94a3b8;">Mensaje:</div>
                       <div style="margin-top:8px;font-size:13px;line-height:19px;color:#cbd5e1;border-left:2px solid #334155;padding-left:12px;">${safeNote}</div>`
                    : ''
                }

                <div style="height:18px"></div>
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center" style="border-radius:12px;background:#2563eb;">
                      <a href="${safeUrl}" style="display:inline-block;padding:12px 16px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">Abrir tarea</a>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:12px;font-size:12px;line-height:18px;color:#94a3b8;">Si el botón no funciona, abre este enlace:</div>
                <div style="margin-top:6px;"><a href="${safeUrl}" style="font-size:12px;color:#60a5fa;word-break:break-all;">${safeUrl}</a></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const text = [
    `Proyecto: ${input.projectName}`,
    'Nueva tarea asignada',
    `Título: ${input.task.title}`,
    input.task.description ? `Descripción: ${input.task.description}` : undefined,
    `Prioridad: ${input.task.priority}`,
    `Estado: ${input.task.status}`,
    `Vence: ${input.task.due_date || '—'}`,
    input.note ? `Mensaje: ${input.note}` : undefined,
    `Enlace: ${input.url}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  return { text, html }
}
