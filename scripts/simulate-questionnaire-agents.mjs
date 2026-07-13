import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

loadDotEnv(join(root, '.env'))

const DEFAULT_QUESTIONS = [
  {
    id: 'long_laptop_sessions',
    text: 'How often do you study more than 1 hour on a laptop?',
    type: 'single_choice',
    options: ['never', 'rarely', 'sometimes', 'often', 'very often']
  },
  {
    id: 'eye_strain',
    text: 'How often do you notice eye strain or tired eyes while studying?',
    type: 'single_choice',
    options: ['never', 'rarely', 'sometimes', 'often', 'very often']
  },
  {
    id: 'neck_shoulder_discomfort',
    text: 'How often do you feel neck or shoulder discomfort during laptop study?',
    type: 'single_choice',
    options: ['never', 'rarely', 'sometimes', 'often', 'very often']
  },
  {
    id: 'gentle_reminders',
    text: 'What reminder style would you prefer?',
    type: 'single_choice',
    options: ['no reminders', 'gentle reminders', 'clear pop-ups', 'sound alerts']
  },
  {
    id: 'context_modes',
    text: 'Would different modes for library, home, or class be useful?',
    type: 'single_choice',
    options: ['not useful', 'slightly useful', 'useful', 'very useful']
  },
  {
    id: 'calibration',
    text: 'Would you accept a short calibration step for more personal posture feedback?',
    type: 'single_choice',
    options: ['no', 'maybe', 'yes']
  },
  {
    id: 'alert_explanation',
    text: 'Do you want the app to explain why a posture or eye alert appears?',
    type: 'single_choice',
    options: ['no', 'maybe', 'yes']
  },
  {
    id: 'app_blocking',
    text: 'Would future app blocking or allow-list features help your focus?',
    type: 'single_choice',
    options: ['no', 'maybe', 'yes, with modes', 'yes, strict blocking']
  }
]

const DEFAULT_PROFILES = [
  'undergraduate student, studies in the library, uses a laptop for long reading sessions',
  'master student, codes at home, often forgets breaks',
  'international student, studies in class and dorm, cares about privacy',
  'student with many online lectures, notices tired eyes after screen time',
  'student who sits with a low laptop, often has neck discomfort',
  'student who dislikes strong notifications and prefers quiet feedback',
  'student preparing exams, wants focus help during long sessions',
  'student who moves between home, library, and classroom'
]

const args = parseArgs(process.argv.slice(2))
const count = numberArg(args.count, 24)
const model = args.model || process.env.LLM_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini'
const baseUrl = trimSlash(
  args.baseUrl || process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
)
const apiKey = args.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY
const outputBase = resolve(root, args.out || 'slides/questionnaire_probe_simulation')
const temperature = numberArg(args.temperature, 0.7)
const useMock = Boolean(args.mock)

if (args.help) {
  printHelp()
  process.exit(0)
}

main().catch((err) => {
  console.error('[simulate-questionnaire-agents] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})

async function main() {
  if (!useMock && !apiKey) {
    throw new Error(
      'Missing LLM_API_KEY or OPENAI_API_KEY. Use --mock for an offline deterministic simulation.'
    )
  }

  const startedAt = new Date().toISOString()
  const agents = buildAgents(count)
  const responses = []

  console.log(
    `[simulate-questionnaire-agents] generating ${agents.length} simulated student profiles`
  )
  console.log('[simulate-questionnaire-agents] note: this is simulated design data, not human research')

  for (const agent of agents) {
    const response = useMock ? mockResponse(agent) : await askLlmAgent(agent)
    responses.push(response)
    console.log(`  ${response.agentId}: ${response.profile.shortName}`)
  }

  const summary = summarizeResponses(responses)
  const payload = {
    metadata: {
      title: 'StudySense questionnaire design probe',
      framing:
        'LLM-assisted simulated questionnaire for design exploration. This is simulated design data, not human participant data.',
      generatedAt: startedAt,
      model: useMock ? 'offline-mock' : model,
      sampleSize: responses.length,
      questions: DEFAULT_QUESTIONS
    },
    summary,
    responses
  }

  mkdirSync(dirname(outputBase), { recursive: true })
  writeFileSync(`${outputBase}.json`, `${JSON.stringify(payload, null, 2)}\n`)
  writeFileSync(`${outputBase}.csv`, toCsv(responses))
  writeFileSync(`${outputBase}_summary.md`, toSummaryMarkdown(payload))

  console.log(`[simulate-questionnaire-agents] wrote ${outputBase}.json`)
  console.log(`[simulate-questionnaire-agents] wrote ${outputBase}.csv`)
  console.log(`[simulate-questionnaire-agents] wrote ${outputBase}_summary.md`)
}

async function askLlmAgent(agent) {
  const messages = [
    {
      role: 'system',
      content:
        'You are an LLM agent role-playing one simulated student profile for design exploration. Answer as a plausible student, but do not claim to be a real participant. Return only valid JSON.'
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          task:
            'Complete this StudySense questionnaire as the simulated student. Keep reasons short and simple.',
          productContext:
            'StudySense is a laptop-camera study assistant. It gives calm feedback about blink, fatigue, distance, posture, and context modes.',
          simulatedProfile: agent,
          outputSchema: {
            agentId: 'string',
            profile: {
              shortName: 'string',
              studyContext: 'string',
              mainConcern: 'string'
            },
            answers: [
              {
                questionId: 'string',
                answer: 'one option from the question',
                scale: 'number from 1 to 5, where higher means stronger need or stronger agreement',
                reason: 'short plain English sentence'
              }
            ],
            designNotes: ['short design implication']
          },
          questions: DEFAULT_QUESTIONS
        },
        null,
        2
      )
    }
  ]

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages
    })
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 500)}`)
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('LLM response did not include message content')
  }

  return normalizeResponse(JSON.parse(extractJson(content)), agent)
}

function mockResponse(agent) {
  const index = Number(agent.id.replace('agent_', '')) || 1
  const profile = {
    shortName: `Simulated Student ${index}`,
    studyContext: agent.profile,
    mainConcern: index % 3 === 0 ? 'posture discomfort' : index % 3 === 1 ? 'eye strain' : 'focus'
  }

  const positive = index % 5 !== 0
  const answers = DEFAULT_QUESTIONS.map((question, qIndex) => {
    let answer = question.options[Math.min(question.options.length - 1, 2)]
    let scale = 3

    if (question.id === 'long_laptop_sessions') {
      answer = index % 4 === 0 ? 'sometimes' : 'often'
      scale = index % 4 === 0 ? 3 : 4
    } else if (question.id === 'eye_strain') {
      answer = index % 7 === 0 ? 'sometimes' : 'often'
      scale = index % 7 === 0 ? 3 : 4
    } else if (question.id === 'neck_shoulder_discomfort') {
      answer = index % 3 === 0 || index % 4 === 0 ? 'often' : 'sometimes'
      scale = answer === 'often' ? 4 : 3
    } else if (question.id === 'gentle_reminders') {
      answer = index % 6 === 0 ? 'clear pop-ups' : 'gentle reminders'
      scale = answer === 'gentle reminders' ? 5 : 3
    } else if (question.id === 'context_modes') {
      answer = positive ? 'useful' : 'slightly useful'
      scale = positive ? 4 : 2
    } else if (question.id === 'calibration') {
      answer = index % 4 === 0 ? 'maybe' : 'yes'
      scale = answer === 'yes' ? 4 : 3
    } else if (question.id === 'alert_explanation') {
      answer = 'yes'
      scale = 5
    } else if (question.id === 'app_blocking') {
      answer = index % 2 === 0 ? 'yes, with modes' : 'maybe'
      scale = index % 2 === 0 ? 4 : 3
    }

    return {
      questionId: question.id,
      answer,
      scale,
      reason: `This matches the simulated student's ${profile.mainConcern} need.`
    }
  })

  return normalizeResponse(
    {
      agentId: agent.id,
      profile,
      answers,
      designNotes: [
        'Use calm and delayed reminders.',
        'Explain why each alert appears.',
        'Support personal calibration and context modes.'
      ]
    },
    agent
  )
}

function normalizeResponse(raw, agent) {
  const answerById = new Map((raw.answers || []).map((answer) => [answer.questionId, answer]))
  return {
    agentId: raw.agentId || agent.id,
    profile: {
      shortName: raw.profile?.shortName || agent.id,
      studyContext: raw.profile?.studyContext || agent.profile,
      mainConcern: raw.profile?.mainConcern || 'study comfort'
    },
    answers: DEFAULT_QUESTIONS.map((question) => {
      const answer = answerById.get(question.id) || {}
      const scale = Number(answer.scale)
      return {
        questionId: question.id,
        question: question.text,
        answer: String(answer.answer || question.options[0]),
        scale: Number.isFinite(scale) ? Math.max(1, Math.min(5, Math.round(scale))) : 3,
        reason: String(answer.reason || 'No reason provided.')
      }
    }),
    designNotes: Array.isArray(raw.designNotes) ? raw.designNotes.map(String) : []
  }
}

function summarizeResponses(responses) {
  const summary = {}
  for (const question of DEFAULT_QUESTIONS) {
    const counts = {}
    let totalScale = 0
    for (const response of responses) {
      const answer = response.answers.find((item) => item.questionId === question.id)
      counts[answer.answer] = (counts[answer.answer] || 0) + 1
      totalScale += answer.scale
    }
    summary[question.id] = {
      question: question.text,
      counts,
      averageScale: Number((totalScale / responses.length).toFixed(2))
    }
  }

  summary.slideMetrics = {
    oftenStudyMoreThanOneHour: percentMatching(responses, 'long_laptop_sessions', [
      'often',
      'very often'
    ]),
    noticeEyeStrain: percentMatching(responses, 'eye_strain', ['often', 'very often']),
    neckOrShoulderDiscomfort: percentMatching(responses, 'neck_shoulder_discomfort', [
      'often',
      'very often'
    ]),
    wantGentleReminders: percentMatching(responses, 'gentle_reminders', ['gentle reminders']),
    wantContextModes: percentMatching(responses, 'context_modes', ['useful', 'very useful'])
  }

  return summary
}

function percentMatching(responses, questionId, positiveAnswers) {
  const hits = responses.filter((response) => {
    const answer = response.answers.find((item) => item.questionId === questionId)
    return positiveAnswers.includes(answer?.answer)
  }).length
  return Math.round((hits / responses.length) * 100)
}

function toCsv(responses) {
  const header = [
    'agentId',
    'shortName',
    'studyContext',
    'mainConcern',
    ...DEFAULT_QUESTIONS.flatMap((question) => [`${question.id}_answer`, `${question.id}_scale`])
  ]
  const rows = responses.map((response) => {
    const cells = [
      response.agentId,
      response.profile.shortName,
      response.profile.studyContext,
      response.profile.mainConcern
    ]
    for (const question of DEFAULT_QUESTIONS) {
      const answer = response.answers.find((item) => item.questionId === question.id)
      cells.push(answer.answer, answer.scale)
    }
    return cells.map(csvCell).join(',')
  })
  return `${header.map(csvCell).join(',')}\n${rows.join('\n')}\n`
}

function toSummaryMarkdown(payload) {
  const lines = [
    '# StudySense Questionnaire Design Probe',
    '',
    '**Framing:** LLM-assisted simulated questionnaire for design exploration.',
    '',
    `**Sample:** n = ${payload.metadata.sampleSize} simulated student profiles.`,
    '',
    '> This is simulated design data, not human participant data.',
    '',
    '## Slide Metrics',
    ''
  ]

  for (const [key, value] of Object.entries(payload.summary.slideMetrics)) {
    lines.push(`- ${key}: ${value}%`)
  }

  lines.push('', '## Question Summary', '')
  for (const question of DEFAULT_QUESTIONS) {
    const item = payload.summary[question.id]
    lines.push(`### ${question.text}`)
    lines.push(`- Average scale: ${item.averageScale}`)
    for (const [answer, count] of Object.entries(item.counts)) {
      lines.push(`- ${answer}: ${count}`)
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

function buildAgents(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `agent_${String(index + 1).padStart(2, '0')}`,
    profile: DEFAULT_PROFILES[index % DEFAULT_PROFILES.length],
    variation:
      index % 2 === 0
        ? 'prefers low interruption and privacy'
        : 'wants stronger help for focus and comfort'
  }))
}

function extractJson(content) {
  const trimmed = content.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  throw new Error(`Cannot parse JSON from LLM content: ${content.slice(0, 200)}`)
}

function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function trimSlash(value) {
  return String(value).replace(/\/+$/, '')
}

function numberArg(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseArgs(argv) {
  const parsed = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--mock') {
      parsed.mock = true
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      parsed[key] = argv[i + 1]
      i += 1
    }
  }
  return parsed
}

function loadDotEnv(file) {
  if (!existsSync(file)) return
  const text = readFileSync(file, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index === -1) continue
    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function printHelp() {
  console.log(`StudySense questionnaire agent simulation

Usage:
  npm run simulate:questionnaire
  npm run simulate:questionnaire -- --count 24 --model gpt-4o-mini
  npm run simulate:questionnaire -- --mock

Options:
  --count <number>       Number of simulated student profiles. Default: 24
  --out <path>           Output path without extension. Default: slides/questionnaire_probe_simulation
  --model <name>         LLM model. Default: LLM_MODEL, OPENAI_MODEL, or gpt-4o-mini
  --base-url <url>       OpenAI-compatible API base URL. Default: https://api.openai.com/v1
  --api-key <key>        API key. Prefer LLM_API_KEY or OPENAI_API_KEY in .env
  --temperature <num>    LLM sampling temperature. Default: 0.7
  --mock                 Offline deterministic simulation, useful for testing
`)
}
