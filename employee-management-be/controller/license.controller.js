import licenseModel from "../models/licenseModel.js";
import employeeModel from "../models/employeeModel.js";

// This validates and stores a license record locally, on the client's own server —
// there is no call out to a central Anthropic/vendor license server here. Wire this
// up to your real issuance system (e.g. verify the key against your own backend)
// before relying on it to gate paid installs.
export const activateLicense = async (req, res) => {
    try {
        const { licenseKey, tier, seats, validForDays } = req.body;

        if (!licenseKey || licenseKey.trim().length < 8) {
            return res.status(400).json({ success: false, message: "A valid license key is required." });
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (Number(validForDays) || 365));

        const license = await licenseModel.findOneAndUpdate(
            {},
            {
                licenseKey,
                tier: tier || "Core",
                seats: seats || 10,
                status: "Active",
                activatedAt: new Date(),
                expiresAt,
            },
            { new: true, upsert: true }
        );

        return res.status(200).json({ success: true, message: "License activated successfully.", data: license });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const getLicenseStatus = async (req, res) => {
    try {
        const license = await licenseModel.findOne({});

        if (!license) {
            return res.status(200).json({ success: true, data: null, message: "Not activated." });
        }

        const isExpired = new Date() > license.expiresAt;
        if (isExpired && license.status !== "Expired") {
            license.status = "Expired";
            await license.save();
        }

        const seatsUsed = await employeeModel.countDocuments({ status: "Active" });

        return res.status(200).json({ success: true, data: { ...license.toObject(), seatsUsed } });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};

export const renewLicense = async (req, res) => {
    try {
        const { licenseKey, validForDays } = req.body;

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (Number(validForDays) || 365));

        const license = await licenseModel.findOneAndUpdate(
            {},
            { ...(licenseKey && { licenseKey }), status: "Active", expiresAt },
            { new: true }
        );

        if (!license) {
            return res.status(404).json({ success: false, message: "No license found to renew. Activate one first." });
        }

        return res.status(200).json({ success: true, message: "License renewed successfully.", data: license });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
};
