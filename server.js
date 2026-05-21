const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const cron = require('node-cron')

const dev = process.env.NODE_ENV !== 'production'
const hostname = 'localhost'
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Server error:', err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  }).listen(port, hostname, () => {
    console.log(`\n🎌 Anime Tracker ready at http://${hostname}:${port}`)
    console.log('📧 Daily update check scheduled for 09:00\n')
  })

  // Daily check at 09:00
  cron.schedule('0 9 * * *', async () => {
    console.log('[cron] Running daily anime update check...')
    try {
      const res = await fetch(`http://${hostname}:${port}/api/check-updates`, {
        method: 'POST',
      })
      const data = await res.json()
      console.log(`[cron] Done — checked: ${data.checked}, notified: ${data.notified}`)
    } catch (err) {
      console.error('[cron] Update check failed:', err)
    }
  }, { timezone: 'Asia/Jerusalem' })
})
