import { randomUUID } from 'crypto'
import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import nodemailer from 'nodemailer'
import { z } from 'zod'
import { getAuthedSupabase, requireAuth, type AuthenticatedRequest } from '../lib/auth.js'
import { buildGenericEmail, buildProjectInvitationEmail, buildTaskAssignmentEmail, getAppBaseUrl } from '../lib/emailTemplates.js'
import { getOptionalEnv } from '../lib/env.js'
import { createSupabaseService } from '../lib/supabase.js'

const router = Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

type ProfileRow = {
  id: string
  full_name: string | null
  avatar_url: string | null
}

async function loadProfilesMap(userIds: string[]) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    return new Map<string, ProfileRow>()
  }

  const service = createSupabaseService()
  const { data } = await service.from('profiles').select('id, full_name, avatar_url').in('id', uniqueIds)
  const rows = (data || []) as ProfileRow[]
  return new Map(rows.map((row) => [row.id, row]))
}

function getSmtpConfig() {
  const smtpHost = getOptionalEnv('SMTP_HOST')
  const smtpPort = getOptionalEnv('SMTP_PORT')
  const smtpUser = getOptionalEnv('SMTP_USER')
  const smtpPass = getOptionalEnv('SMTP_PASS')
  const smtpFrom = getOptionalEnv('SMTP_FROM')
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) return null
  return { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom }
}

function createTransporter(config: NonNullable<ReturnType<typeof getSmtpConfig>>) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort),
    secure: Number(config.smtpPort) === 465,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  })
}

const createProjectSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(400).optional().or(z.literal('')),
})

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const supabase = getAuthedSupabase(r)

  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) {
    res.status(401).json({ success: false, error: 'Invalid session' })
    return
  }

  const user = authData.user
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || null
  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || null

  await supabase.from('profiles').upsert({
    id: user.id,
    full_name: fullName,
    avatar_url: avatarUrl,
  })

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      fullName,
      avatarUrl,
    },
    profile,
  })
})

router.get('/projects', requireAuth, async (req: Request, res: Response) => {
  const supabase = getAuthedSupabase(req as AuthenticatedRequest)
  const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }
  res.json({ success: true, projects: data })
})

router.get('/dashboard-summary', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const supabase = getAuthedSupabase(r)

  const [{ data: projectRows, error: projectError }, { data: assignmentRows, error: assignmentError }, { data: timeRows, error: timeError }] =
    await Promise.all([
      supabase.from('projects').select('id, name'),
      supabase
        .from('task_assignees')
        .select('task_id')
        .eq('user_id', r.auth.userId),
      supabase
        .from('time_entries')
        .select('id, project_id, task_id, entry_date, minutes, note')
        .eq('user_id', r.auth.userId)
        .order('entry_date', { ascending: false })
        .limit(5),
    ])

  if (projectError || assignmentError || timeError) {
    res.status(400).json({
      success: false,
      error: projectError?.message || assignmentError?.message || timeError?.message || 'Cannot load dashboard summary',
    })
    return
  }

  const taskIds = [...new Set((assignmentRows || []).map((row: any) => row.task_id).filter(Boolean))]
  let taskRows: any[] = []
  if (taskIds.length > 0) {
    const { data: tasks, error: taskError } = await supabase
      .from('tasks')
      .select('id, project_id, title, status, priority, due_date')
      .in('id', taskIds)
      .order('created_at', { ascending: false })

    if (taskError) {
      res.status(400).json({ success: false, error: taskError.message })
      return
    }
    taskRows = tasks || []
  }

  const projectMap = new Map(((projectRows as any[]) || []).map((project) => [project.id, project.name]))
  const taskByStatus = {
    backlog: 0,
    todo: 0,
    in_progress: 0,
    done: 0,
  }

  const myTasks = taskRows.map((task) => {
    taskByStatus[task.status as keyof typeof taskByStatus] += 1
    return {
      id: task.id,
      projectId: task.project_id,
      projectName: projectMap.get(task.project_id) || 'Proyecto',
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.due_date,
    }
  })

  const recentTime = ((timeRows as any[]) || []).map((entry) => ({
    id: entry.id,
    projectId: entry.project_id,
    taskId: entry.task_id,
    projectName: projectMap.get(entry.project_id) || 'Proyecto',
    entryDate: entry.entry_date,
    minutes: entry.minutes,
    note: entry.note,
  }))

  res.json({
    success: true,
    summary: {
      projectCount: (projectRows || []).length,
      myTasks: {
        counts: taskByStatus,
        items: myTasks.slice(0, 5),
      },
      recentTime,
    },
  })
})

router.post('/projects', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const parsed = createProjectSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const supabase = getAuthedSupabase(r)
  const projectId = randomUUID()
  const createdAt = new Date().toISOString()
  const { error } = await supabase
    .from('projects')
    .insert({
      id: projectId,
      created_by: r.auth.userId,
      name: parsed.data.name,
      description: parsed.data.description || null,
    })

  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }

  const service = createSupabaseService()
  const { error: memberError } = await service.from('project_members').upsert(
    {
      project_id: projectId,
      user_id: r.auth.userId,
      project_role: 'admin',
    },
    { onConflict: 'project_id,user_id', ignoreDuplicates: true },
  )

  if (memberError) {
    res.status(500).json({ success: false, error: memberError.message })
    return
  }

  res.status(201).json({
    success: true,
    project: {
      id: projectId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      status: 'active',
      created_at: createdAt,
    },
  })
})

router.get('/projects/:projectId', requireAuth, async (req: Request, res: Response) => {
  const supabase = getAuthedSupabase(req as AuthenticatedRequest)
  const { projectId } = req.params
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single()
  if (error) {
    res.status(404).json({ success: false, error: 'Project not found' })
    return
  }
  res.json({ success: true, project: data })
})

router.get('/projects/:projectId/members', requireAuth, async (req: Request, res: Response) => {
  const supabase = getAuthedSupabase(req as AuthenticatedRequest)
  const { projectId } = req.params

  const { data: project, error: projectError } = await supabase.from('projects').select('id').eq('id', projectId).single()
  if (projectError || !project) {
    res.status(404).json({ success: false, error: 'Project not found' })
    return
  }

  const { data: members, error } = await supabase
    .from('project_members')
    .select('user_id, project_role, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }

  const profileMap = await loadProfilesMap(((members as any[]) || []).map((member) => member.user_id))
  const items = ((members as any[]) || []).map((member) => {
    const profile = profileMap.get(member.user_id)
    return {
      userId: member.user_id,
      projectRole: member.project_role,
      createdAt: member.created_at,
      fullName: profile?.full_name || null,
      avatarUrl: profile?.avatar_url || null,
    }
  })

  res.json({ success: true, members: items })
})

const updateMemberRoleSchema = z.object({
  projectRole: z.enum(['admin', 'member']),
})

router.patch('/projects/:projectId/members/:userId', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const parsed = updateMemberRoleSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const supabase = getAuthedSupabase(r)
  const { projectId, userId } = req.params

  const { data: targetRow, error: targetError } = await supabase
    .from('project_members')
    .select('user_id, project_role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single()

  if (targetError || !targetRow) {
    res.status(404).json({ success: false, error: 'Member not found' })
    return
  }

  if (targetRow.project_role === 'admin' && parsed.data.projectRole !== 'admin') {
    const { data: admins } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('project_role', 'admin')

    const adminCount = (admins || []).length
    if (adminCount <= 1 && (admins || []).some((x: any) => x.user_id === userId)) {
      res.status(400).json({ success: false, error: 'Cannot remove last admin' })
      return
    }
  }

  const { data, error } = await supabase
    .from('project_members')
    .update({ project_role: parsed.data.projectRole })
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .select('user_id, project_role')
    .single()

  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }

  res.json({ success: true, member: { userId: data.user_id, projectRole: data.project_role } })
})

router.delete('/projects/:projectId/members/:userId', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const supabase = getAuthedSupabase(r)
  const { projectId, userId } = req.params

  const { data: targetRow, error: targetError } = await supabase
    .from('project_members')
    .select('user_id, project_role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single()

  if (targetError || !targetRow) {
    res.status(404).json({ success: false, error: 'Member not found' })
    return
  }

  if (targetRow.project_role === 'admin') {
    const { data: admins } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', projectId)
      .eq('project_role', 'admin')

    const adminCount = (admins || []).length
    if (adminCount <= 1 && (admins || []).some((x: any) => x.user_id === userId)) {
      res.status(400).json({ success: false, error: 'Cannot remove last admin' })
      return
    }
  }

  const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId)
  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }

  res.json({ success: true })
})

const createInvitationSchema = z.object({
  email: z.string().email(),
  projectRole: z.enum(['admin', 'member']).default('member'),
  expiresInDays: z.number().int().min(1).max(60).optional(),
  note: z.string().max(800).optional().or(z.literal('')),
})

router.get('/projects/:projectId/invitations', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const supabase = getAuthedSupabase(r)
  const { projectId } = req.params

  const { data, error } = await supabase
    .from('project_invitations')
    .select('id, invited_email, project_role, token, created_at, expires_at, accepted_at, accepted_by, revoked_at, created_by')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }

  res.json({ success: true, invitations: data || [] })
})

router.post('/projects/:projectId/invitations', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const parsed = createInvitationSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const smtpConfig = getSmtpConfig()
  if (!smtpConfig) {
    res.status(501).json({ success: false, error: 'SMTP not configured' })
    return
  }

  const supabase = getAuthedSupabase(r)
  const { projectId } = req.params

  const [{ data: project }, { data: inviterProfile }] = await Promise.all([
    supabase.from('projects').select('id,name').eq('id', projectId).single(),
    supabase.from('profiles').select('full_name').eq('id', r.auth.userId).maybeSingle(),
  ])

  if (!project) {
    res.status(404).json({ success: false, error: 'Project not found' })
    return
  }

  const baseUrl = getAppBaseUrl(req)
  const token = randomUUID()
  const expiresInDays = parsed.data.expiresInDays ?? 7
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
  const invitedEmail = parsed.data.email.trim().toLowerCase()
  const note = parsed.data.note?.trim() || ''

  const { data, error } = await supabase
    .from('project_invitations')
    .insert({
      project_id: projectId,
      invited_email: invitedEmail,
      project_role: parsed.data.projectRole,
      token,
      created_by: r.auth.userId,
      expires_at: expiresAt,
    })
    .select('id, invited_email, project_role, token, created_at, expires_at, accepted_at, accepted_by, revoked_at, created_by')
    .single()

  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }

  const url = `${baseUrl}/invite?token=${encodeURIComponent(token)}`
  const emailContent = buildProjectInvitationEmail({
    projectName: project.name,
    invitedByName: inviterProfile?.full_name || null,
    projectRole: parsed.data.projectRole,
    note,
    url,
  })

  const transporter = createTransporter(smtpConfig)
  const subject = `Invitación a ${project.name}`
  await transporter.sendMail({
    from: smtpConfig.smtpFrom,
    to: invitedEmail,
    subject,
    text: emailContent.text,
    html: emailContent.html,
  })

  const preview = `Invitación a ${project.name}`.slice(0, 200)
  await supabase.from('email_logs').insert({
    project_id: projectId,
    task_id: null,
    to_email: invitedEmail,
    subject,
    body_preview: preview,
    sent_by: r.auth.userId,
  })

  res.status(201).json({ success: true, invitation: data })
})

router.post('/projects/:projectId/invitations/:invitationId/resend', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const smtpConfig = getSmtpConfig()
  if (!smtpConfig) {
    res.status(501).json({ success: false, error: 'SMTP not configured' })
    return
  }

  const supabase = getAuthedSupabase(r)
  const { projectId, invitationId } = req.params

  const [{ data: project }, { data: invitation }, { data: inviterProfile }] = await Promise.all([
    supabase.from('projects').select('id,name').eq('id', projectId).single(),
    supabase
      .from('project_invitations')
      .select('id, invited_email, project_role, token, expires_at, accepted_at, revoked_at')
      .eq('project_id', projectId)
      .eq('id', invitationId)
      .single(),
    supabase.from('profiles').select('full_name').eq('id', r.auth.userId).maybeSingle(),
  ])

  if (!project || !invitation) {
    res.status(404).json({ success: false, error: 'Invitation not found' })
    return
  }

  if (invitation.revoked_at || invitation.accepted_at) {
    res.status(400).json({ success: false, error: 'Invitation not active' })
    return
  }

  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    res.status(400).json({ success: false, error: 'Invitation expired' })
    return
  }

  const baseUrl = getAppBaseUrl(req)
  const url = `${baseUrl}/invite?token=${encodeURIComponent(invitation.token)}`
  const emailContent = buildProjectInvitationEmail({
    projectName: project.name,
    invitedByName: inviterProfile?.full_name || null,
    projectRole: invitation.project_role,
    url,
  })

  const transporter = createTransporter(smtpConfig)
  const subject = `Invitación a ${project.name}`
  await transporter.sendMail({
    from: smtpConfig.smtpFrom,
    to: invitation.invited_email,
    subject,
    text: emailContent.text,
    html: emailContent.html,
  })

  const preview = `Invitación a ${project.name}`.slice(0, 200)
  await supabase.from('email_logs').insert({
    project_id: projectId,
    task_id: null,
    to_email: invitation.invited_email,
    subject,
    body_preview: preview,
    sent_by: r.auth.userId,
  })

  res.json({ success: true })
})

router.delete('/projects/:projectId/invitations/:invitationId', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const supabase = getAuthedSupabase(r)
  const { projectId, invitationId } = req.params

  const { data, error } = await supabase
    .from('project_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('id', invitationId)
    .is('accepted_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }

  if (!data) {
    res.status(404).json({ success: false, error: 'Invitation not found' })
    return
  }

  res.json({ success: true })
})

const createTaskSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional().or(z.literal('')),
  status: z.enum(['backlog', 'todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().optional().or(z.literal('')),
})

router.get('/projects/:projectId/tasks', requireAuth, async (req: Request, res: Response) => {
  const supabase = getAuthedSupabase(req as AuthenticatedRequest)
  const { projectId } = req.params
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }

  const tasks = (data || []) as any[]
  const taskIds = tasks.map((task) => task.id)
  let assigneeRows: any[] = []

  if (taskIds.length > 0) {
    const { data: assignees, error: assigneeError } = await supabase
      .from('task_assignees')
      .select('task_id, user_id')
      .in('task_id', taskIds)

    if (assigneeError) {
      res.status(400).json({ success: false, error: assigneeError.message })
      return
    }

    assigneeRows = assignees || []
  }

  const profileMap = await loadProfilesMap(assigneeRows.map((row) => row.user_id))
  const assigneesByTask = new Map<string, any[]>()
  for (const row of assigneeRows) {
    const current = assigneesByTask.get(row.task_id) || []
    const profile = profileMap.get(row.user_id)
    current.push({
      userId: row.user_id,
      fullName: profile?.full_name || null,
      avatarUrl: profile?.avatar_url || null,
    })
    assigneesByTask.set(row.task_id, current)
  }

  res.json({
    success: true,
    tasks: tasks.map((task) => ({
      ...task,
      assignees: assigneesByTask.get(task.id) || [],
    })),
  })
})

router.post('/projects/:projectId/tasks', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const parsed = createTaskSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const { projectId } = req.params
  const supabase = getAuthedSupabase(r)
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: projectId,
      created_by: r.auth.userId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      status: parsed.data.status || 'todo',
      priority: parsed.data.priority || 'medium',
      due_date: parsed.data.dueDate ? parsed.data.dueDate : null,
    })
    .select('*')
    .single()

  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }
  res.status(201).json({ success: true, task: data })
})

const updateTaskSchema = z
  .object({
    title: z.string().min(2).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z.enum(['backlog', 'todo', 'in_progress', 'done']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    dueDate: z.string().nullable().optional(),
  })
  .strict()

router.patch('/tasks/:taskId', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const parsed = updateTaskSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }
  const { taskId } = req.params
  const supabase = getAuthedSupabase(r)
  const patch: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) patch.title = parsed.data.title
  if (parsed.data.description !== undefined) patch.description = parsed.data.description
  if (parsed.data.status !== undefined) patch.status = parsed.data.status
  if (parsed.data.priority !== undefined) patch.priority = parsed.data.priority
  if (parsed.data.dueDate !== undefined) patch.due_date = parsed.data.dueDate

  const { data, error } = await supabase.from('tasks').update(patch).eq('id', taskId).select('*').single()
  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }
  res.json({ success: true, task: data })
})

const replaceTaskAssigneesSchema = z.object({
  assigneeUserIds: z.array(z.string().uuid()).max(20),
  notify: z.boolean().optional(),
  note: z.string().max(800).optional().or(z.literal('')),
})

router.put('/tasks/:taskId/assignees', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const parsed = replaceTaskAssigneesSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const supabase = getAuthedSupabase(r)
  const { taskId } = req.params
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, project_id, title, description, priority, status, due_date')
    .eq('id', taskId)
    .single()
  if (taskError || !task) {
    res.status(404).json({ success: false, error: 'Task not found' })
    return
  }

  const notify = Boolean(parsed.data.notify)
  const note = parsed.data.note?.trim() || ''
  const smtpConfig = notify ? getSmtpConfig() : null
  if (notify && !smtpConfig) {
    res.status(501).json({ success: false, error: 'SMTP not configured' })
    return
  }

  const { data: existingAssignees, error: existingError } = await supabase
    .from('task_assignees')
    .select('user_id')
    .eq('task_id', taskId)

  if (existingError) {
    res.status(400).json({ success: false, error: existingError.message })
    return
  }

  const previousUserIds = [...new Set((existingAssignees || []).map((x: any) => x.user_id).filter(Boolean))]

  const userIds = [...new Set(parsed.data.assigneeUserIds)]
  if (userIds.length > 0) {
    const { data: members, error: memberError } = await supabase
      .from('project_members')
      .select('user_id')
      .eq('project_id', task.project_id)
      .in('user_id', userIds)

    if (memberError) {
      res.status(400).json({ success: false, error: memberError.message })
      return
    }

    if ((members || []).length !== userIds.length) {
      res.status(400).json({ success: false, error: 'Some assignees do not belong to this project' })
      return
    }
  }

  const { error: deleteError } = await supabase.from('task_assignees').delete().eq('task_id', taskId)
  if (deleteError) {
    res.status(400).json({ success: false, error: deleteError.message })
    return
  }

  if (userIds.length > 0) {
    const { error: insertError } = await supabase.from('task_assignees').insert(
      userIds.map((userId) => ({
        task_id: taskId,
        user_id: userId,
      })),
    )

    if (insertError) {
      res.status(400).json({ success: false, error: insertError.message })
      return
    }
  }

  const newAssignees = userIds.filter((id) => !previousUserIds.includes(id))

  if (notify && newAssignees.length > 0 && smtpConfig) {
    const [{ data: project }] = await Promise.all([
      supabase.from('projects').select('name').eq('id', task.project_id).single(),
    ])

    const baseUrl = getAppBaseUrl(req)
    const url = `${baseUrl}/projects/${task.project_id}?tab=tasks&taskId=${encodeURIComponent(taskId)}`

    const service = createSupabaseService()
    const transporter = createTransporter(smtpConfig)

    for (const userId of newAssignees) {
      const { data: userData, error: userError } = await service.auth.admin.getUserById(userId)
      if (userError || !userData?.user?.email) continue

      const toEmail = userData.user.email.toLowerCase()
      const subject = `Nueva tarea asignada: ${task.title}`
      const emailContent = buildTaskAssignmentEmail({
        projectName: project?.name || 'Proyecto',
        task,
        note,
        url,
      })

      await transporter.sendMail({
        from: smtpConfig.smtpFrom,
        to: toEmail,
        subject,
        text: emailContent.text,
        html: emailContent.html,
      })

      const preview = `${task.title} — ${note}`.slice(0, 200)
      await supabase.from('email_logs').insert({
        project_id: task.project_id,
        task_id: taskId,
        to_email: toEmail,
        subject,
        body_preview: preview,
        sent_by: r.auth.userId,
      })
    }
  }

  const profileMap = await loadProfilesMap(userIds)
  res.json({
    success: true,
    assignees: userIds.map((userId) => {
      const profile = profileMap.get(userId)
      return {
        userId,
        fullName: profile?.full_name || null,
        avatarUrl: profile?.avatar_url || null,
      }
    }),
  })
})

const acceptInvitationSchema = z.object({
  token: z.string().uuid(),
})

router.post('/invitations/accept', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const parsed = acceptInvitationSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const supabase = getAuthedSupabase(r)
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user?.email) {
    res.status(401).json({ success: false, error: 'Invalid session' })
    return
  }

  const userEmail = authData.user.email.trim().toLowerCase()
  const service = createSupabaseService()

  const { data: invitation, error } = await service
    .from('project_invitations')
    .select('id, project_id, invited_email, project_role, expires_at, accepted_at, revoked_at')
    .eq('token', parsed.data.token)
    .single()

  if (error || !invitation) {
    res.status(404).json({ success: false, error: 'Invitation not found' })
    return
  }

  if (invitation.revoked_at || invitation.accepted_at) {
    res.status(400).json({ success: false, error: 'Invitation not active' })
    return
  }

  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    res.status(400).json({ success: false, error: 'Invitation expired' })
    return
  }

  if (String(invitation.invited_email || '').trim().toLowerCase() !== userEmail) {
    res.status(403).json({ success: false, error: 'Invitation email mismatch' })
    return
  }

  const { error: upsertError } = await service.from('project_members').upsert(
    {
      project_id: invitation.project_id,
      user_id: r.auth.userId,
      project_role: invitation.project_role,
    },
    { onConflict: 'project_id,user_id', ignoreDuplicates: true },
  )

  if (upsertError) {
    res.status(400).json({ success: false, error: upsertError.message })
    return
  }

  await service
    .from('project_invitations')
    .update({ accepted_by: r.auth.userId, accepted_at: new Date().toISOString() })
    .eq('id', invitation.id)

  res.json({ success: true, projectId: invitation.project_id })
})

router.get('/time-entries', requireAuth, async (req: Request, res: Response) => {
  const supabase = getAuthedSupabase(req as AuthenticatedRequest)

  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined
  const from = typeof req.query.from === 'string' ? req.query.from : undefined
  const to = typeof req.query.to === 'string' ? req.query.to : undefined

  let q = supabase.from('time_entries').select('*').order('entry_date', { ascending: false })
  if (projectId) q = q.eq('project_id', projectId)
  if (userId) q = q.eq('user_id', userId)
  if (from) q = q.gte('entry_date', from)
  if (to) q = q.lte('entry_date', to)

  const { data, error } = await q
  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }
  res.json({ success: true, timeEntries: data })
})

const createTimeEntrySchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid().optional().or(z.literal('')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minutes: z.number().int().min(1).max(24 * 60),
  note: z.string().max(500).optional().or(z.literal('')),
})

router.post('/time-entries', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const parsed = createTimeEntrySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const supabase = getAuthedSupabase(r)
  const { data, error } = await supabase
    .from('time_entries')
    .insert({
      project_id: parsed.data.projectId,
      task_id: parsed.data.taskId || null,
      user_id: r.auth.userId,
      entry_date: parsed.data.date,
      minutes: parsed.data.minutes,
      note: parsed.data.note || null,
    })
    .select('*')
    .single()
  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }
  res.status(201).json({ success: true, timeEntry: data })
})

router.delete('/time-entries/:timeEntryId', requireAuth, async (req: Request, res: Response) => {
  const supabase = getAuthedSupabase(req as AuthenticatedRequest)
  const { timeEntryId } = req.params
  const { error } = await supabase.from('time_entries').delete().eq('id', timeEntryId)
  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }
  res.json({ success: true })
})

router.get('/projects/:projectId/documents', requireAuth, async (req: Request, res: Response) => {
  const supabase = getAuthedSupabase(req as AuthenticatedRequest)
  const { projectId } = req.params
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }
  res.json({ success: true, documents: data })
})

router.post('/projects/:projectId/documents', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const { projectId } = req.params

  const file = (req as any).file as Express.Multer.File | undefined
  if (!file) {
    res.status(400).json({ success: false, error: 'Missing file' })
    return
  }

  const taskId = typeof (req as any).body?.taskId === 'string' ? (req as any).body.taskId : ''
  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '_')
  const objectPath = `projects/${projectId}/${randomUUID()}-${safeName}`
  const bucket = 'project-documents'

  const authedSupabase = getAuthedSupabase(r)

  const { error: accessError } = await authedSupabase.from('projects').select('id').eq('id', projectId).single()
  if (accessError) {
    res.status(403).json({ success: false, error: 'Not allowed' })
    return
  }

  const service = createSupabaseService()
  const { error: uploadError } = await service.storage.from(bucket).upload(objectPath, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  })
  if (uploadError) {
    res.status(400).json({ success: false, error: uploadError.message })
    return
  }

  const { data, error } = await authedSupabase
    .from('documents')
    .insert({
      project_id: projectId,
      task_id: taskId || null,
      filename: file.originalname,
      storage_path: objectPath,
      uploaded_by: r.auth.userId,
    })
    .select('*')
    .single()

  if (error) {
    await service.storage.from(bucket).remove([objectPath])
    res.status(400).json({ success: false, error: error.message })
    return
  }

  res.status(201).json({ success: true, document: data })
})

router.get('/documents/:documentId/download', requireAuth, async (req: Request, res: Response) => {
  const supabase = getAuthedSupabase(req as AuthenticatedRequest)
  const { documentId } = req.params
  const { data: doc, error } = await supabase.from('documents').select('*').eq('id', documentId).single()
  if (error || !doc) {
    res.status(404).json({ success: false, error: 'Document not found' })
    return
  }

  const bucket = 'project-documents'
  const service = createSupabaseService()
  const { data, error: signError } = await service.storage.from(bucket).createSignedUrl(doc.storage_path, 60)
  if (signError || !data) {
    res.status(400).json({ success: false, error: signError?.message || 'Cannot sign url' })
    return
  }

  res.json({ success: true, url: data.signedUrl })
})

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(140),
  body: z.string().min(1).max(8000),
  taskId: z.string().uuid().optional().or(z.literal('')),
})

router.get('/projects/:projectId/emails', requireAuth, async (req: Request, res: Response) => {
  const supabase = getAuthedSupabase(req as AuthenticatedRequest)
  const { projectId } = req.params
  const { data, error } = await supabase
    .from('email_logs')
    .select('*')
    .eq('project_id', projectId)
    .order('sent_at', { ascending: false })
  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }
  res.json({ success: true, emails: data })
})

router.post('/projects/:projectId/emails/send', requireAuth, async (req: Request, res: Response) => {
  const r = req as AuthenticatedRequest
  const parsed = sendEmailSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const smtpConfig = getSmtpConfig()
  if (!smtpConfig) {
    res.status(501).json({
      success: false,
      error: 'SMTP not configured',
    })
    return
  }

  const { projectId } = req.params
  const supabase = getAuthedSupabase(r)

  const { error: accessError } = await supabase.from('projects').select('id').eq('id', projectId).single()
  if (accessError) {
    res.status(403).json({ success: false, error: 'Not allowed' })
    return
  }

  const transporter = createTransporter(smtpConfig)

  const baseUrl = getAppBaseUrl(req)
  const bodyNote = parsed.data.body
  const taskId = parsed.data.taskId && parsed.data.taskId !== '' ? parsed.data.taskId : null

  let emailContent: { text: string; html?: string }
  let previewSource = bodyNote

  if (taskId) {
    const [{ data: project }, { data: task }] = await Promise.all([
      supabase.from('projects').select('name').eq('id', projectId).single(),
      supabase
        .from('tasks')
        .select('id,title,description,priority,status,due_date')
        .eq('id', taskId)
        .eq('project_id', projectId)
        .single(),
    ])

    if (project && task) {
      const url = `${baseUrl}/projects/${projectId}?tab=tasks&taskId=${encodeURIComponent(taskId)}`
      emailContent = buildTaskAssignmentEmail({ projectName: project.name, task, note: bodyNote, url })
      previewSource = `${task.title} — ${bodyNote}`
    } else {
      const url = `${baseUrl}/projects/${projectId}`
      emailContent = buildGenericEmail({ subject: parsed.data.subject, body: bodyNote, url })
    }
  } else {
    const url = `${baseUrl}/projects/${projectId}`
    emailContent = buildGenericEmail({ subject: parsed.data.subject, body: bodyNote, url })
  }

  await transporter.sendMail({
    from: smtpConfig.smtpFrom,
    to: parsed.data.to,
    subject: parsed.data.subject,
    text: emailContent.text,
    html: emailContent.html,
  })

  const preview = previewSource.slice(0, 200)
  const { data, error } = await supabase
    .from('email_logs')
    .insert({
      project_id: projectId,
      task_id: taskId,
      to_email: parsed.data.to,
      subject: parsed.data.subject,
      body_preview: preview,
      sent_by: r.auth.userId,
    })
    .select('*')
    .single()

  if (error) {
    res.status(400).json({ success: false, error: error.message })
    return
  }

  res.status(201).json({ success: true, email: data })
})

export default router
