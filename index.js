const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { v4: uuidv4 } = require("uuid");
const crypto = require("crypto");

require("dotenv").config();

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB Connection Error:", err));

  const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    phone: String,
    age: Number,
    password: String,
    referralCode: { type: String, unique: true },
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 },
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

const ReferralSchema = new mongoose.Schema({
  referrer: String,
  referee: String,
  campaign: String,
  couponCode: String,
  loginCount: { type: Number, default: 0 },
});


const Campaign = mongoose.model("Campaign", campaignSchema);
const Referral = mongoose.model("Referral", ReferralSchema);
const User = mongoose.model("User", userSchema);
  
// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET ,  { expiresIn: "7d" });
};



// User Registration
app.post("/register", async (req, res) => {
  const { name, email, phone, age, password, referralCode } = req.body;

  try {
    let userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newReferralCode = uuidv4().slice(0, 8); // Generate 8-character referral code

    let referredBy = null;

    // If referral code exists, update referral count
    if (referralCode) {
      let referrer = await User.findOne({ referralCode });
      if (referrer) {
        referredBy = referralCode;
        await User.updateOne({ referralCode }, { $inc: { referralCount: 1 } });
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

    res.json({
      message: "User registered successfully",
      token,
      referralCode: newReferralCode,
    });

  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

app.get("/refer/data", async (req, res) => {
  try {
    const users = await User.find(); // Fetch all user data
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});


// User Login
app.post("/login", async (req, res) => {
  try {
    const { email, password, couponCode } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    if (couponCode) {
      const referral = await Referral.findOne({ couponCode });
      if (referral) {
        referral.loginCount += 1;
        await referral.save();

        const referrer = await User.findOne({ referralCode: referral.referrer });
        if (referrer) {
          referrer.rewards += 1;
          await referrer.save();
        }

        return res.json({
          token: generateToken(user._id),
          user,
          referrerName: referrer ? referrer.name : "Unknown",
          totalLogins: referral.loginCount,
        });
      }
    }

    res.json({ token: generateToken(user._id), user });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Admin Login
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;
  if (email === "task@gmail.com" && password === "Humansorce@%%4$") {
    const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.status(200).json({ token, message: "Admin login successful" });
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
});

// Admin Name Endpoint
app.get("/admin/name", (req, res) => {
  res.json({ name: "Mahesh Doe", message: "task@gmail.com" });
});

// Create Campaign & Send Emails
app.post("/campaign", async (req, res) => {
  try {
    const newCampaign = new Campaign(req.body);
    await newCampaign.save();
    res.status(201).json({ message: "Campaign created successfully!", campaign: newCampaign });
  } catch (err) {
    res.status(500).json({ error: "Failed to create campaign", details: err });
  }
});

// GET: Retrieve All Campaigns
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

//  Delete a campaign by ID
app.delete("/campaign/:id", async (req, res) => {
  try {
    const deletedCampaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!deletedCampaign) return res.status(404).json({ error: "Campaign not found" });

    res.status(200).json({ message: "Campaign deleted successfully!", campaign: deletedCampaign });
  } catch (err) {
    res.status(500).json({ error: "Error deleting campaign", details: err });
  }
});


// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
