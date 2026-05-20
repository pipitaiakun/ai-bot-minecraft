const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const OpenAI = require("openai")
const fs = require('fs')
const Vec3 = require('vec3')
require('dotenv').config()

const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY
})

// Load needs dan memory
let needs = JSON.parse(fs.readFileSync('./needs.json', 'utf8'))
let memory = JSON.parse(fs.readFileSync('./memory.json', 'utf8'))

function saveNeeds() {
    fs.writeFileSync('./needs.json', JSON.stringify(needs, null, 2))
}

function saveMemory() {
    fs.writeFileSync('./memory.json', JSON.stringify(memory, null, 2))
}

const houseBlocks = [
    { x: 0, y: 0, z: 0, type: 'oak_planks' },
    { x: 1, y: 0, z: 0, type: 'oak_planks' },
    { x: 0, y: 0, z: 1, type: 'oak_planks' },
    { x: 1, y: 0, z: 1, type: 'oak_planks' },
    { x: 0, y: 1, z: 0, type: 'oak_planks' }
]

async function askAI(prompt) {
    const completion = await client.chat.completions.create({
        model: "deepseek/deepseek-chat",
        messages: [
            {
                role: "user",
                content: prompt
            }
        ]
    })
    return completion.choices[0].message.content
}

const bot = mineflayer.createBot({
    host: 'walswaktu.aternos.me',
    port: 46301,
    username: 'eve',
    version: '1.21.11'
})

bot.loadPlugin(pathfinder)

bot.on('connect', () => {
    console.log('Socket connected!')
})

bot.on('login', () => {
    console.log('Bot login berhasil!')
})

bot.once('spawn', () => {
    console.log('Bot masuk server!')
    
    const mcData = require('minecraft-data')(bot.version)
    const movements = new Movements(bot, mcData)
    
    bot.pathfinder.setMovements(movements)
    bot.pathfinder.setGoal(
        new goals.GoalBlock(10, 64, 10)
    )
    
    bot.chat('Halo dunia!')
    
    // Random looking behavior - bot jadi suka lihat-lihat
    setInterval(() => {
        const random = Math.random()
        if(random < 0.2) {
            bot.look(
                Math.random() * Math.PI,
                Math.random() * Math.PI
            )
        }
    }, 5000)

    // Goal system untuk membuat bot terasa hidup
    evaluateGoals()
    setInterval(evaluateGoals, 20000)
})

bot.on('kicked', (reason) => {
    console.log('Bot kicked:', reason)
})

bot.on('error', (err) => {
    console.error('Bot error:', err)
})

bot.on('end', (reason) => {
    console.log('Koneksi bot terputus:', reason)
})

// Natural Chat Response
bot.on('chat', async (username, message) => {
    // Jangan jawab pesan sendiri
    if(username === bot.username) return
    
    // Update memory - catat player yang chat
    if(!memory.friends.includes(username)) {
        memory.friends.push(username)
        saveMemory()
    }
    memory.lastChat = { username, message, time: new Date().toISOString() }
    saveMemory()
    
    // 70% cuek, 30% jawab
    const random = Math.random()
    if(random < 0.7) {
        console.log(`[IGNORED] ${username}: ${message}`)
        return
    }
    
    console.log(`[CHAT] ${username}: ${message}`)
    
    const prompt = `
    Kamu player minecraft manusia.
    
    STATUS:
    - Lapar: ${needs.hunger}%
    - Energy: ${needs.energy}%
    - Mood sosial: ${needs.social}%
    - Rumah: x${memory.home.x} y${memory.home.y} z${memory.home.z}
    - Teman: ${memory.friends.join(', ')}
    
    Chat player:
    ${username}: ${message}
    
    Jawab singkat natural (1-2 kalimat).
    Kadang cuek.
    Jangan formal.
    Jangan terlalu panjang.
    Jangan gunakan emotikon atau emoji.
    `
    
    try {
        const reply = await askAI(prompt)
        bot.chat(reply)
        console.log(`[REPLY] ${reply}`)
        
        // Update social needs setelah chat
        needs.social = Math.max(0, needs.social - 5)
        saveNeeds()
    } catch (err) {
        console.error('Chat error:', err.message)
    }
})

async function test() {
    const result = await askAI("Halo siapa kamu?")
    console.log(result)
}

async function think() {
    const prompt = `
    Kamu adalah pemain Minecraft cewek tsundere yang peduli.
    Jawab dengan karaktermu (malu-malu tapi sebenarnya peduli, dll).
    Jawab ringkas dan natural, jangan terlalu kasar.

    STATUS SAAT INI:
    - Lapar: ${needs.hunger}%
    - Energy: ${needs.energy}%
    - Mood sosial: ${needs.social}%
    - Rumah: x${memory.home.x} y${memory.home.y} z${memory.home.z}
    - Teman: ${memory.friends.join(', ')}
    - Last chat: ${memory.lastChat ? memory.lastChat.username + ': ' + memory.lastChat.message : 'tidak ada'}

    Kondisi bot sekarang:
    - Waktu: Malam hari
    - Kayu di inventory: 20
    - Dekat dengan pohon
    - Ada creeper dekat!

    PENTING: Jawab HANYA dengan action keywords berikut:
    - makan (jika lapar)
    - ambil kayu (jika perlu kayu)
    - lari (jika ada musuh)
    - bangun rumah (jika perlu perlindungan)
    - mining (jika cari batu)
    - tidur (jika malam)
    - chat (jika ingin ngomong)

    Lalu tambahkan penjelasan dengan karakter tsundere.
    Jangan menggunakan emotikon atau emoji.
    `

    const result = await askAI(prompt)
    console.log("\n=== AI Decision ===")
    console.log(result)
    
    // Parse action dari hasil
    await executeAction(result)
    
    // Update needs seiring waktu
    needs.hunger = Math.max(0, needs.hunger - 10)
    needs.energy = Math.max(0, needs.energy - 15)
    needs.social = Math.max(0, needs.social - 5)
    saveNeeds()
    
    console.log("\n=== Current Needs ===")
    console.log(`Hunger: ${needs.hunger}%, Energy: ${needs.energy}%, Social: ${needs.social}%`)
}

async function executeAction(result) {
    console.log("\n=== Executing Actions ===")
    
    if(result.toLowerCase().includes('makan') || result.toLowerCase().includes('eat')) {
        await eatFood()
    }
    
    if(result.toLowerCase().includes('ambil kayu') || result.toLowerCase().includes('kayu')) {
        await collectWood()
    }
    
    if(result.toLowerCase().includes('lari') || result.toLowerCase().includes('escape')) {
        await runAway()
    }
    
    if(result.toLowerCase().includes('bangun rumah') || result.toLowerCase().includes('perlindungan')) {
        await buildHouse()
    }
    
    if(result.toLowerCase().includes('mining') || result.toLowerCase().includes('tambang')) {
        await startMining()
    }
    
    if(result.toLowerCase().includes('tidur') || result.toLowerCase().includes('sleep')) {
        await sleep()
    }
    
    if(result.toLowerCase().includes('chat') || result.toLowerCase().includes('ngomong')) {
        chatMessage(result)
    }
}

function eatFood() {
    console.log("🍖 Bot sedang makan...")
    bot.chat("Hmm, sedap! *makan dengan girang*")
}

function collectWood() {
    console.log("🌳 Bot sedang mengambil kayu...")
    bot.chat("Aku ambil kayu ini ya... *potong pohon*")
}

function runAway() {
    console.log("🏃 Bot sedang lari dari musuh!")
    bot.chat("K-kyaaaa! *lari panik*")
}

function buildHouse() {
    console.log("🏠 Bot sedang membangun rumah...")
    bot.chat("Y-yosh! Aku bangun rumah sekarang! *fokus*")
}

async function startMining() {
    console.log("⛏️  Bot sedang mining...")
    const block = bot.findBlock({
        matching: block => block.name.includes('coal'),
        maxDistance: 32
    })
    if (!block) {
        bot.chat("Gak nemu batu bara deket sini...")
        return
    }
    bot.chat("Coba ambil batu bara dulu... *semangat*")
    await bot.pathfinder.goto(new goals.GoalBlock(block.position.x, block.position.y, block.position.z))
    await digBlock(block)
}

function digBlock(block) {
    return new Promise((resolve, reject) => {
        bot.dig(block, (err) => {
            if (err) {
                return reject(err)
            }
            resolve()
        })
    })
}

async function buildHouse() {
    console.log("🏠 Bot sedang membangun rumah...")
    bot.chat("Y-yosh! Aku bangun rumah sekarang! *fokus*")
    await placeHouseTemplate()
}

async function placeHouseTemplate() {
    const home = memory.home
    for (const blockDef of houseBlocks) {
        const targetPos = new Vec3(home.x + blockDef.x, home.y + blockDef.y, home.z + blockDef.z)
        const referencePos = targetPos.offset(0, -1, 0)
        const referenceBlock = bot.blockAt(referencePos)
        if (!referenceBlock) continue
        const item = bot.inventory.items().find(i => i.name.includes(blockDef.type))
        if (!item) {
            bot.chat("Butuh bahan bangunan lebih dulu...")
            return
        }
        try {
            await bot.equip(item, 'hand')
            await bot.pathfinder.goto(new goals.GoalBlock(referencePos.x, referencePos.y, referencePos.z))
            await placeBlock(referenceBlock, targetPos)
        } catch (err) {
            console.error('Build house error:', err)
        }
    }
}

function placeBlock(referenceBlock, targetPos) {
    return new Promise((resolve, reject) => {
        bot.placeBlock(referenceBlock, targetPos.minus(referenceBlock.position), (err) => {
            if (err) {
                return reject(err)
            }
            resolve()
        })
    })
}

function sleep() {
    console.log("😴 Bot sedang tidur...")
    bot.chat("Aku tidur dulu... *mengantuk*")
}

function chatMessage(result) {
    console.log("💬 Bot sedang chat...")
    const message = result.substring(0, 100) // Ambil bagian dialog
    bot.chat(message)
}

function isMonsterNearby() {
    const monsters = Object.values(bot.entities).filter(entity => {
        if (!entity || entity.type !== 'mob' || !entity.position) return false
        if (entity === bot.entity) return false
        const distance = entity.position.distanceTo(bot.entity.position)
        return distance < 16
    })
    return monsters.length > 0
}

function hasHouse() {
    const home = memory.home
    if (!home || typeof home.x !== 'number') return false
    const block = bot.blockAt(new Vec3(home.x, home.y, home.z))
    return block && block.name.includes('planks')
}

async function findFood() {
    console.log('🍗 Mencari makanan...')
    bot.chat('Aku cari makanan dulu ya...')
    eatFood()
}

async function explore() {
    console.log('🔍 Bot sedang explore...')
    bot.chat('Coba lihat-lihat sekitar...')
    const pos = bot.entity.position
    const x = pos.x + (Math.random() * 40 - 20)
    const z = pos.z + (Math.random() * 40 - 20)
    await bot.pathfinder.goto(new goals.GoalBlock(Math.round(x), Math.round(pos.y), Math.round(z)))
}

async function evaluateGoals() {
    if (!bot.entity) return
    console.log('=== Evaluating Goals ===')
    if (isMonsterNearby()) {
        await runAway()
    } else if (needs.hunger < 30) {
        await findFood()
    } else if (!hasHouse()) {
        await buildHouse()
    } else {
        await explore()
    }
}

// Uncomment mana yang mau dijalankan:
// test()
think()