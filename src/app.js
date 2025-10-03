import { join } from 'path'
import fs from 'fs'
import { createBot, createProvider, createFlow, addKeyword, utils } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import { BaileysProvider as Provider } from '@builderbot/provider-baileys'

const PORT = process.env.PORT ?? 3008

// ================== Cargar JSON con toda la info ==================
const data = JSON.parse(fs.readFileSync ('./data/proyectos_estructurado_from_doc.json', 'utf8'))

// ================== Flujos inteligentes ==================

// 🔎 Búsqueda libre
const searchFlow = addKeyword(['pregunta', 'buscar', 'consulta'])
  .addAnswer('🔎 Escribe tu pregunta sobre gestión de proyectos:', { capture: true },
    async (ctx, { flowDynamic }) => {
      const q = ctx.body.toLowerCase()

      // Armar índice de búsqueda
      const docs = []

      if (data.objetivo) docs.push({ cat: 'Objetivo', text: data.objetivo })
      if (data.alcance) docs.push({ cat: 'Alcance', text: data.alcance })

      data.definiciones.forEach(d =>
        docs.push({ cat: `Definición: ${d.term}`, text: `${d.term}: ${d.descripcion}` })
      )

      data.condiciones_generales.forEach((c, i) =>
        docs.push({ cat: `Condición ${i + 1}`, text: c })
      )

      data.procedimiento.forEach(p =>
        docs.push({
          cat: `Paso ${p.No}`,
          text: `Actividad: ${p.Actividad}. Responsable: ${p.Responsable}. Producto: ${p.Producto}`
        })
      )

      data.anexos.forEach((a, i) =>
        docs.push({ cat: `Anexo ${i + 1}`, text: a })
      )

      // Buscar coincidencias exactas
      let results = docs.filter(d => d.text.toLowerCase().includes(q))

      // Buscar por palabras clave
      if (!results.length) {
        const words = q.split(/\s+/).filter(w => w.length > 3)
        results = docs.filter(d => words.some(w => d.text.toLowerCase().includes(w)))
      }

      if (!results.length) {
        await flowDynamic('❌ No encontré nada relacionado. Intenta con otras palabras más simples.')
        return
      }

      // Responder máximo 3 coincidencias
      const top = results.slice(0, 3)
      for (const r of top) {
        await flowDynamic(`📌 *${r.cat}*\n${r.text}`)
      }
    }
  )

// ================== Flujos de contenido ==================
const objetivoFlow = addKeyword('objetivo')
  .addAnswer(`🎯 *Objetivo:* ${data.objetivo}`)
  .addAnswer(`📌 *Alcance:* ${data.alcance}`)

const definicionFlow = addKeyword(['definicion', 'definición'])
  .addAnswer('Escribe el término que quieres consultar (ej: "Innovación social")', { capture: true },
    async (ctx, { flowDynamic }) => {
      const q = ctx.body.toLowerCase().trim()
      const hit = data.definiciones.find(d => d.term.toLowerCase().includes(q))
      if (hit) {
        await flowDynamic(`*${hit.term}:* ${hit.descripcion}`)
        return
      }
      await flowDynamic('❌ No encontré ese término.')
    }
  )

const condicionesFlow = addKeyword('condiciones')
  .addAnswer('⚖️ *Condiciones Generales:*')
  .addAnswer(data.condiciones_generales.map((c, i) => `${i + 1}. ${c}`).join('\n'))

const procedimientoFlow = addKeyword('paso')
  .addAnswer('Escribe el número de paso (1-50):', { capture: true },
    async (ctx, { flowDynamic }) => {
      const n = ctx.body.trim()
      const hit = data.procedimiento.find(p => String(p.No) === n || String(p.No).replace('.', '') === n)
      if (!hit) {
        await flowDynamic('❌ No encontré ese paso. Prueba entre 1 y 50.')
        return
      }
      await flowDynamic(
        `*Paso ${hit.No}*\n📌 Actividad: ${hit.Actividad}\n👤 Responsable: ${hit.Responsable || '—'}\n📄 Producto: ${hit.Producto || '—'}`
      )
    }
  )

const anexosFlow = addKeyword('anexos')
  .addAnswer('📎 *Anexos y recursos:*')
  .addAnswer(data.anexos.map((a, i) => `${i + 1}. ${a}`).join('\n'))

// ================== Flujo de registro (guardar sesión) ==================
const registroFlow = addKeyword(['registro', 'registrar'])
  .addAnswer('📝 Para comenzar necesito algunos datos.\n¿Cuál es tu *nombre*?', { capture: true },
    async (ctx, { state }) => {
      await state.update({ nombre: ctx.body })
    }
  )
  .addAnswer('¿De qué *programa académico* eres?', { capture: true },
    async (ctx, { state }) => {
      await state.update({ programa: ctx.body })
    }
  )
  .addAction(async (_, { flowDynamic, state }) => {
    await flowDynamic(
      `✅ Registro completado.\n👤 Nombre: ${state.get('nombre')}\n🏫 Programa: ${state.get('programa')}`
    )
  })

// ================== Menú principal ==================
const proyectosFlow = addKeyword(['proyecto', 'convocatoria'])
  .addAnswer('📑 Bienvenido al asistente de *Gestión de Proyectos* de la Universidad Mariana')
  .addAnswer(
    [
      'Selecciona qué deseas consultar:',
      '👉 *objetivo* — Objetivo y Alcance',
      '👉 *definicion* — Consultar definiciones',
      '👉 *condiciones* — Condiciones Generales',
      '👉 *paso* — Procedimiento (1-50)',
      '👉 *anexos* — Documentos y recursos',
      '👉 *pregunta* — Búsqueda libre',
      '👉 *registro* — Guardar tus datos'
    ].join('\n')
  )

// ================== Saludo inicial con Clara el búho ==================
const welcomeFlow = addKeyword(['hola', 'buenas', 'hi', 'hello'])
  .addAnswer(
    `🦉 Hola, soy *Clara el búho*, tu guía en investigaciones de la Universidad Mariana.`,
    { media: join(process.cwd(), 'assets', 'clara_logo.png') } // aquí pones tu logo en assets
  )
  .addAnswer(
    [
      'Estoy aquí para ayudarte a entender la gestión de proyectos de investigación.',
      '👉 Escribe *proyecto* para comenzar.',
      '👉 O escribe *registro* para guardar tu información.'
    ].join('\n')
  )

// ================== MAIN ==================
const main = async () => {
  const adapterFlow = createFlow([
    welcomeFlow,
    proyectosFlow,
    objetivoFlow,
    definicionFlow,
    condicionesFlow,
    procedimientoFlow,
    anexosFlow,
    searchFlow,
    registroFlow
  ])

  const adapterProvider = createProvider(Provider)
  const adapterDB = new Database()

  const { handleCtx, httpServer } = await createBot({
    flow: adapterFlow,
    provider: adapterProvider,
    database: adapterDB,
  })

  adapterProvider.server.post(
    '/v1/messages',
    handleCtx(async (bot, req, res) => {
      const { number, message, urlMedia } = req.body
      await bot.sendMessage(number, message, { media: urlMedia ?? null })
      return res.end('sended')
    })
  )

  httpServer(+PORT)
}

main()
