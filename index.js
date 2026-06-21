require('dotenv').config();

const { Client, GatewayIntentBits, AttachmentBuilder, SlashCommandBuilder } = require('discord.js');
const mongoose = require('mongoose'); // 🍃 เปลี่ยนมาใช้ Mongoose แทน SQLite
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const express = require('express');
const path = require('path');
const fs = require('fs');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const ADMIN_ROLE_IDS = process.env.ADMIN_ROLE_ID ? process.env.ADMIN_ROLE_ID.split(',') : [];

// ==========================================
// Web Server สำหรับ Render (เตรียมพร้อมรัน 24 ชม.)
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('PorkHyuk Points Bot is Alive! 🐸'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Web Server พร้อมสแตนด์บาย'));

// ==========================================
// 🍃 เชื่อมต่อ MongoDB Atlas (เซฟบนคลาวด์ ข้อมูลไม่มีวันหาย)
// ==========================================
// ลิงก์ที่ประกอบรหัสผ่านของพี่เรียบร้อยแล้ว (เพิ่ม /porkhyuk เพื่อแยกหมวดหมู่ฐานข้อมูล)
const MONGO_URI = 'mongodb+srv://porkuser:PorkHyuk1234@cluster0.vkvd8qy.mongodb.net/porkhyuk?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(MONGO_URI)
    .then(() => console.log('🍃 เชื่อมต่อฐานข้อมูล MongoDB Atlas สำเร็จ! พร้อมลุย 24 ชม.!'))
    .catch(err => console.error('❌ เชื่อมต่อ MongoDB ล้มเหลว:', err));

// โครงสร้างข้อมูลแต้มลูกค้าบนคลาวด์
const customerSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    stamps: { type: Number, default: 0 }
});
const Customer = mongoose.model('Customer', customerSchema);

// ==========================================
// เริ่มระบบบอท DISCORD
// ==========================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// พิกัด Custom ทีละดวง (ปรับจูนตามระยะช่องที่อาร์ตเวิร์กไม่เท่ากัน)
const stampPositions = [
    { x: 145, y: 335 }, // ช่อง 1
    { x: 285, y: 335 }, // ช่อง 2
    { x: 405, y: 335 }, // ช่อง 3
    { x: 525, y: 335 }, // ช่อง 4
    { x: 655, y: 335 }, // ช่อง 5
    { x: 125, y: 465 }, // ช่อง 6
    { x: 265, y: 465 }, // ช่อง 7
    { x: 390, y: 465 }, // ช่อง 8
    { x: 525, y: 465 }, // ช่อง 9
    { x: 655, y: 465 }  // ช่อง 10
];

client.once('clientReady', async () => {
    console.log(`🤖 บอทปั๊มแต้มออนไลน์แล้วในชื่อ: ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('addstamp')
            .setDescription('📥 [แอดมิน/ทีมงาน] ปั๊มแสตมป์สะสมแต้มให้ลูกค้า')
            .addUserOption(opt => opt.setName('user').setDescription('เลือกผู้ใช้ที่ต้องการปั๊มแต้ม').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('จำนวนดวงที่ต้องการเพิ่ม').setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('removestamp')
            .setDescription('📤 [แอดมิน/ทีมงาน] ลบแสตมป์สะสมแต้มของลูกค้า (เช่น ตอนแลกรางวัล)')
            .addUserOption(opt => opt.setName('user').setDescription('เลือกผู้ใช้ที่ต้องการลบแต้ม').setRequired(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('จำนวนดวงที่ต้องการลบ').setRequired(false)),

        new SlashCommandBuilder()
            .setName('card')
            .setDescription('🔮 [ลูกค้า] เรียกดูบัตรสะสมแต้มปัจจุบันของคุณ')
    ];

    await client.application.commands.set(commands);
    console.log('✅ อัปเดตเมนู Slash Commands ขึ้น Discord เรียบร้อย!');
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- คำสั่ง /addstamp ---
    if (commandName === 'addstamp') {
        const hasPermission = ADMIN_ROLE_IDS.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasPermission) {
            return await interaction.reply({ content: '❌ เฉพาะแอดมินหรือทีมงานที่ได้รับอนุญาตเท่านั้นที่มีสิทธิ์ปั๊มแต้มครับ!', ephemeral: true });
        }

        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount') || 1;

        try {
            let customer = await Customer.findOne({ userId: targetUser.id });
            if (!customer) {
                customer = new Customer({ userId: targetUser.id, stamps: 0 });
            }

            customer.stamps += amount;
            let note = '';
            
            // ล็อคไว้ไม่ให้เกิน 10
            if (customer.stamps >= 10) {
                customer.stamps = 10;
                note = '\n🎉 **โอ้โห! ลูกค้าสะสมแต้มครบ 10 ครั้งแล้ว! อย่าลืมแจกรางวัลฟรีนะครับ!**';
            }

            await customer.save(); // เซฟขึ้นเว็บ MongoDB

            const imageBuffer = await drawCard(customer.stamps);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'porkhyuk-card.png' });

            await interaction.editReply({
                content: `✅ ปั๊มแสตมป์ให้คุณ ${targetUser} เพิ่มสำเร็จ! ตอนนี้สะสมได้ **${customer.stamps}/10** ดวงแล้วครับ${note}`,
                files: [attachment]
            });
        } catch (err) {
            console.error(err);
            await interaction.editReply('❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลลงฐานข้อมูลครับ');
        }
    }

    // --- คำสั่ง /removestamp ---
    if (commandName === 'removestamp') {
        const hasPermission = ADMIN_ROLE_IDS.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasPermission) {
            return await interaction.reply({ content: '❌ เฉพาะแอดมินหรือทีมงานที่ได้รับอนุญาตเท่านั้นที่มีสิทธิ์ลบแต้มครับ!', ephemeral: true });
        }

        await interaction.deferReply();

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount') || 1;

        try {
            let customer = await Customer.findOne({ userId: targetUser.id });
            if (!customer) {
                customer = new Customer({ userId: targetUser.id, stamps: 0 });
            }

            customer.stamps -= amount;
            
            // ล็อคไว้ไม่ให้ติดลบ
            if (customer.stamps < 0) {
                customer.stamps = 0;
            }

            await customer.save(); // เซฟขึ้นเว็บ MongoDB

            const imageBuffer = await drawCard(customer.stamps);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'porkhyuk-card.png' });

            await interaction.editReply({
                content: `➖ ลบแสตมป์ของคุณ ${targetUser} ออกจำนวน **${amount}** ดวง! (ตอนนี้เหลือสะสม **${customer.stamps}/10** ดวงครับ)`,
                files: [attachment]
            });
        } catch (err) {
            console.error(err);
            await interaction.editReply('❌ เกิดข้อผิดพลาดในการลบข้อมูลครับ');
        }
    }

    // --- คำสั่ง /card ---
    if (commandName === 'card') {
        await interaction.deferReply();

        try {
            const customer = await Customer.findOne({ userId: interaction.user.id });
            const currentStamps = customer ? customer.stamps : 0;

            const imageBuffer = await drawCard(currentStamps);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'my-card.png' });

            await interaction.editReply({
                content: `🔮 บัตรสะสมแต้มล่าสุดของคุณ **${interaction.user.username}** (สะสมได้: **${currentStamps}/10** ดวง)`,
                files: [attachment]
            });
        } catch (err) {
            console.error(err);
            await interaction.editReply('❌ ดึงข้อมูลบัตรสะสมแต้มไม่สำเร็จครับ');
        }
    }
});

// ฟังก์ชันวาดรูป
async function drawCard(stampCount) {
    const canvas = createCanvas(1000, 667);
    const ctx = canvas.getContext('2d');
    let cardImage, stampImage;

    try {
        const cardBuffer = fs.readFileSync(path.join(__dirname, 'card'));
        cardImage = await loadImage(cardBuffer);
        if (cardImage) ctx.drawImage(cardImage, 0, 0, 1000, 667);
    } catch (err) {
        ctx.fillStyle = '#0052cc'; 
        ctx.fillRect(0, 0, 1000, 667);
    }

    try {
        const stampBuffer = fs.readFileSync(path.join(__dirname, 'stamp'));
        stampImage = await loadImage(stampBuffer);
    } catch (err) {}

    for (let i = 0; i < stampCount; i++) {
        if (i < stampPositions.length) {
            const pos = stampPositions[i];
            if (stampImage) {
                ctx.drawImage(stampImage, pos.x - 45, pos.y - 45, 90, 90);
            } else {
                ctx.beginPath(); 
                ctx.arc(pos.x, pos.y, 45, 0, Math.PI * 2);
                ctx.fillStyle = '#ff6b00'; 
                ctx.fill();
            }
        }
    }
    return canvas.toBuffer('image/png');
}

client.login(TOKEN);