const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

// ============================ MongoDB Connection ============================

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ MongoDB Connected"))
.catch((err) => console.error("❌ MongoDB Error:", err));

// ============================ SCHEMAS ============================

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  phone: String,
  age: Number,
  password: String,
  referralCode: { type: String, unique: true },
  referredBy: { type: String, default: null },
  referralCount: { type: Number, default: 0 },
  rewards: { type: Number, default: 0 },
});

const campaignSchema = new mongoose.Schema({
  title: String,
  aboutCampaign: String,
  startDate: Date,
  endDate: Date,
  rewardType: String,
  rewardFormat: String,
  discountValue: Number,
  campaignMessage: String,
  status: { type: String, enum: ["active", "inactive"], default: "active" }
});

const referralSchema = new mongoose.Schema({
  referrer: String,
  referee: String,
  campaign: String,
  couponCode: String,
  loginCount: { type: Number, default: 0 },
});

// ============================ MODELS ============================

const User = mongoose.model("User", userSchema);
const Campaign = mongoose.model("Campaign", campaignSchema);
const Referral = mongoose.model("Referral", referralSchema);

// ============================ UTILS ============================

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// ============================ NODEMAILER ============================

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: "care31430@gmail.com",
    pass: "dmgpzxiktbhcxuob",
  },
});

// ============================ ROUTES ============================

// ➤ Send Email
// Replace with the correct path to your User model

app.post('/send-email', async (req, res) => {
  
  try {
    // Fetch all users from the database
    const users = await User.find({}, 'email'); // Only select the 'email' field

    if (!users || users.length === 0) {
      return res.status(404).json({ success: false, message: 'No users found to send emails' });
    }

    // Create a list of email sending promises
    const emailPromises = users.map(user => {
      const mailOptions = {
        from: '"Your App" <your-email@gmail.com>',
        to: user.email,
        subject: "🚀 New Campaign Started - Join Now & Earn Instantly!",
        text: "Hello user! A new campaign has started just for you. Join now and get rewarded instantly. Don’t miss out!",
        html: "<h2>🎉 Hurry Up!</h2><p>We’ve just launched a <strong>new referral campaign</strong> where you can earn exciting rewards instantly.</p><ul><li>Invite your friends</li><li>They sign up using your referral code</li><li>You both get rewarded instantly!</li></ul><p><a href='https://hureshop.netlify.app/register' style='background-color:#4CAF50;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;'>Join Now</a></p><p>Don’t wait—this offer won’t last long!</p>"
      
      };

      return transporter.sendMail(mailOptions);
    });

    // Wait for all emails to be sent
    await Promise.all(emailPromises);

    res.status(200).json({ success: true, message: `Emails sent to ${users.length} users!` });
  } catch (error) {
    console.error('Error sending emails:', error);
    res.status(500).json({ success: false, message: 'Failed to send emails', error });
  }
});
// Route to send email to a specific user
app.post('/user/sendmail', async (req, res) => {
  const {  email } = req.body;

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email address is required' });
  }

  try {
    // Fetch user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found with this email' });
    }

    const { name, referralCode } = user;
    const registerLink = `https://hureshop.netlify.app/register`;

    const text = `
Hi ${name},

Invite your friends and earn rewards instantly! 🤑

Use your unique referral code: ${referralCode}

They can join using this link:
${registerLink}

Hurry! Don’t miss the chance to earn exciting rewards.
    `;

    const mailOptions = {
      from: '"Your App" <your-email@gmail.com>',
      to: email,
      subject:`Welcome ${name}  `,
      text,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ success: true, message: `Email sent to ${email}` });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, message: 'Failed to send email', error });
  }
});




// ➤ User Registration
app.post("/register", async (req, res) => {
  const { name, email, phone, age, password, referralCode } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newReferralCode = uuidv4().slice(0, 8);
    let referredBy = null;

    let referrerUser = null;

    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        referredBy = referralCode;
        await User.updateOne({ referralCode }, { $inc: { referralCount: 1 } });

        const newReferral = new Referral({
          referrer: referralCode,
          referee: email,
          campaign: "",
          couponCode: referralCode,
        });

        await newReferral.save();

        // Save for later email to referrer
        referrerUser = referrer;
      }
    }

    const newUser = new User({
      name,
      email,
      phone,
      age,
      password: hashedPassword,
      referralCode: newReferralCode,
      referredBy,
    });

    await newUser.save();
    const token = generateToken(newUser._id);

    // === Send confirmation email to new user ===
    await transporter.sendMail({
      from: '"Your App" <your-email@gmail.com>',
      to: email,
      subject: "Welcome to Our App 🎉",
      html: `<h3>Hi ${name},</h3><p>Thanks for registering! Your referral code is <strong>${newReferralCode}</strong>.</p>`
    });

    // === If referred, send email to referrer ===
    if (referrerUser) {
      await transporter.sendMail({
        from: '"Your App" <your-email@gmail.com>',
        to: referrerUser.email,
        subject: "You've Referred a New User! 🎁",
        html: `<h3>Hey ${referrerUser.name},</h3><p>${name} just signed up using your referral code <strong>${referralCode}</strong>! 🎉</p>`
      });
    }

    res.status(201).json({
      message: "User registered successfully",
      token,
      referralCode: newReferralCode,
    });

  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ message: "Server error", error });
  }
});



// ➤ User Login
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    let referrerName = null;
    let totalLogins = 0;

    if (couponCode) {
      const referral = await Referral.findOne({ couponCode });
      if (referral) {
        referral.loginCount += 1;
        await referral.save();

        const referrer = await User.findOne({ referralCode: referral.referrer });
        if (referrer) {
          referrer.rewards += 1;
          await referrer.save();
          referrerName = referrer.name;
        }

        totalLogins = referral.loginCount;
      }
    }

    res.json({
      token: generateToken(user._id),
      user,
      referrerName: referrerName || "Unknown",
      totalLogins,
    });

  } catch (error) {
    res.status(500).json({ error: "Server error", details: error });
  }
});

// ➤ Admin Login
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;
  if (email === "task@gmail.com" && password === "Humansorce@%%4$") {
    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.status(200).json({ token, message: "Admin login successful" });
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
});

app.get("/admin/name", (req, res) => {
  res.json({ name: "Mahesh Doe", message: "task@gmail.com" });
});

// ➤ Campaign Routes
app.post("/campaign", async (req, res) => {
  try {
    const newCampaign = new Campaign(req.body);
    await newCampaign.save();
    res.status(201).json({ message: "Campaign created successfully!", campaign: newCampaign });
  } catch (err) {
    res.status(500).json({ error: "Failed to create campaign", details: err });
  }
});

app.get("/campaign/data", async (req, res) => {
  try {
    const campaigns = await Campaign.find();
    res.status(200).json(campaigns);
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve campaigns", details: err });
  }
});

app.get("/campaign/:id", async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });
    res.status(200).json(campaign);
  } catch (err) {
    res.status(500).json({ error: "Error fetching campaign", details: err });
  }
});


app.put("/campaign/:id", async (req, res) => {
  try {
    const updatedCampaign = await Campaign.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedCampaign) return res.status(404).json({ error: "Campaign not found" });
    res.status(200).json({ message: "Campaign updated successfully!", campaign: updatedCampaign });
  } catch (err) {
    res.status(500).json({ error: "Error updating campaign", details: err });
  }
});

app.delete("/campaign/:id", async (req, res) => {
  try {
    const deletedCampaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!deletedCampaign) return res.status(404).json({ error: "Campaign not found" });
    res.status(200).json({ message: "Campaign deleted successfully!", campaign: deletedCampaign });
  } catch (err) {
    res.status(500).json({ error: "Error deleting campaign", details: err });
  }
});

// ➤ Get All Users
app.get("/refer/data", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// ➤ Get Single User by Email
app.get("/refer/data/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// ➤ Get Referred Users by Coupon Code
// app.get("/refer/by-coupon/:couponcode", async (req, res) => {
//   try {
//     const couponCode = req.params.couponcode;

//     const referredUsers = await User.find({ referredBy: couponCode })
//       .select("name email referralCode -_id")
//       .lean();

//     res.status(200).json({
//       success: true,
//       referralCode: couponCode,
//       referredUsers: referredUsers || []
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Something went wrong",
//       referredUsers: []
//     });
//   }
// });





// ============================ SERVER ============================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
