// Demo teams: fills the firm out into proper reporting teams so the hierarchy can be tried.
//
//   node scripts/demoTeams.js seed    → add people, arrange everyone into teams, one project per squad
//   node scripts/demoTeams.js clean   → remove what `seed` added and put old reporting lines back
//
// Shape:  Director → Senior Manager → Manager → Team Lead (Senior Consultant) → Consultant
//         → Junior Consultant + Associate.  Two practices, two managers each, two squads per manager.
//
// Everything added is tagged (`demoTeam: true` on people and designations, project codes "DT-")
// so `clean` can find it. Existing people moved into a team keep their old manager in
// `demoPrevManager` so `clean` can restore it. The access role of each new person comes from
// their designation (utils/hierarchy.js), so permissions follow the role automatically.
import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import crypto from "crypto";
import Employee from "../models/employeeModel.js";
import LeaveBalance from "../models/LeaveBalanceModel.js";
import Designation from "../models/designationModel.js";
import Project from "../models/ProjectModel.js";
import Task from "../models/taskModel.js";
import ProjectTimeLog from "../models/projectTimeLogModel.js";
import Notification from "../models/notificationModel.js";
import { defaultRoleFor } from "../utils/hierarchy.js";

dotenv.config();

const AUDIT = "Audit & Assurance";
// [first, last, designation, department, reports-to email, gender]
const NEW_PEOPLE = [
    // Practice A · Manager Demo's second squad
    ["Arjun", "Menon", "Senior Consultant", AUDIT, "manager@astral.test", "Male"],
    ["Nisha", "Pillai", "Consultant", AUDIT, "arjun.menon@astral.test", "Female"],
    ["Rohit", "Das", "Junior Consultant", AUDIT, "nisha.pillai@astral.test", "Male"],
    ["Fathima", "Banu", "Associate", AUDIT, "nisha.pillai@astral.test", "Female"],
    // Practice A · Kavya Raman's team
    ["Kavya", "Raman", "Manager", AUDIT, "senior.manager@astral.test", "Female"],
    ["Suresh", "Babu", "Senior Consultant", AUDIT, "kavya.raman@astral.test", "Male"],
    ["Pooja", "Iyer", "Consultant", AUDIT, "suresh.babu@astral.test", "Female"],
    ["Vignesh", "Kumar", "Junior Consultant", AUDIT, "pooja.iyer@astral.test", "Male"],
    ["Swathi", "Murugan", "Associate", AUDIT, "pooja.iyer@astral.test", "Female"],
    ["Meera", "Krishnan", "Senior Consultant", AUDIT, "kavya.raman@astral.test", "Female"],
    ["Harish", "Kumar", "Consultant", AUDIT, "meera.krishnan@astral.test", "Male"],
    ["Anitha", "Selvam", "Junior Consultant", AUDIT, "harish.kumar@astral.test", "Female"],
    ["Gokul", "Raj", "Associate", AUDIT, "harish.kumar@astral.test", "Male"],
    // Practice B · Deepak Rao's team
    ["Deepak", "Rao", "Manager", AUDIT, "anjali.patel@example.com", "Male"],
    ["Ramya", "Shankar", "Senior Consultant", AUDIT, "deepak.rao@astral.test", "Female"],
    ["Karan", "Mehta", "Consultant", AUDIT, "ramya.shankar@astral.test", "Male"],
    ["Lavanya", "Prakash", "Junior Consultant", AUDIT, "karan.mehta@astral.test", "Female"],
    ["Ajay", "Nair", "Associate", AUDIT, "karan.mehta@astral.test", "Male"],
    ["Prakash", "Iyer", "Senior Consultant", AUDIT, "deepak.rao@astral.test", "Male"],
    ["Divakar", "Subramani", "Consultant", AUDIT, "prakash.iyer@astral.test", "Male"],
    ["Keerthana", "Venkat", "Junior Consultant", AUDIT, "divakar.subramani@astral.test", "Female"],
    ["Sanjay", "Thomas", "Associate", AUDIT, "divakar.subramani@astral.test", "Male"],
    // functions
    ["Revathi", "Sundar", "HR", "Human Resources", "hr.head@astral.test", "Female"],
    ["Bala", "Murali", "Accounts", "Accounts & Finance", "accounts.head@astral.test", "Male"],
];

// Existing people placed into the teams: email → reports-to email.
const MOVES = {
    "anjali.patel@example.com": "director@astral.test",
    "manager@hoook.com": "anjali.patel@example.com",
    "teamlead@hoook.com": "manager@hoook.com",
    "vikram.singh@example.com": "manager@hoook.com",
    "john.doe4@example.com": "teamlead@hoook.com",
    "divya.nair@example.com": "john.doe4@example.com",
    "mohan.krishna@example.com": "john.doe4@example.com",
    "rahul.verma@example.com": "vikram.singh@example.com",
    "karthi@gmail.com": "vikram.singh@example.com",
    "sneha.reddy@example.com": "rahul.verma@example.com",
    "staff@hoook.com": "rahul.verma@example.com",
    "senior.consultant@astral.test": "manager@astral.test",
    "consultant@astral.test": "senior.consultant@astral.test",
    "junior.consultant@astral.test": "consultant@astral.test",
    "associate@astral.test": "consultant@astral.test",
    "hr@hoook.com": "hr.head@astral.test",
};

// One project per squad: [code, name, client, lead email, member emails, status]
const PROJECTS = [
    ["DT-101", "Statutory audit · FY 2025-26", "Sunrise Textiles Pvt Ltd", "senior.consultant@astral.test", ["consultant@astral.test", "junior.consultant@astral.test", "associate@astral.test"], "Active"],
    ["DT-102", "Statutory audit · FY 2025-26", "Kaveri Agro Foods LLP", "arjun.menon@astral.test", ["nisha.pillai@astral.test", "rohit.das@astral.test", "fathima.banu@astral.test"], "Active"],
    ["DT-103", "Internal audit · Q3", "Meenakshi Motors Ltd", "suresh.babu@astral.test", ["pooja.iyer@astral.test", "vignesh.kumar@astral.test", "swathi.murugan@astral.test"], "Active"],
    ["DT-104", "Internal audit · Inventory cycle", "Coromandel Pharma Pvt Ltd", "meera.krishnan@astral.test", ["harish.kumar@astral.test", "anitha.selvam@astral.test", "gokul.raj@astral.test"], "Planning"],
    ["DT-105", "GST audit · FY 2025-26", "Bharat Logistics Co", "teamlead@hoook.com", ["john.doe4@example.com", "divya.nair@example.com", "mohan.krishna@example.com"], "Active"],
    ["DT-106", "Tax audit · FY 2025-26", "Meenakshi Motors Ltd", "vikram.singh@example.com", ["rahul.verma@example.com", "karthi@gmail.com", "sneha.reddy@example.com", "staff@hoook.com"], "Active"],
    ["DT-107", "Process review · Procurement", "Kaveri Agro Foods LLP", "ramya.shankar@astral.test", ["karan.mehta@astral.test", "lavanya.prakash@astral.test", "ajay.nair@astral.test"], "Active"],
    ["DT-108", "IT general controls review", "Coromandel Pharma Pvt Ltd", "prakash.iyer@astral.test", ["divakar.subramani@astral.test", "keerthana.venkat@astral.test", "sanjay.thomas@astral.test"], "On Hold"],
];
const TASKS = [
    ["Planning memo and risk assessment", "Done", "High", -6],
    ["Walkthroughs of key processes", "In Progress", "High", 2],
    ["Vouching and sample testing", "To Do", "Medium", 6],
    ["Draft observations for review", "To Do", "Medium", 11],
    ["Confirm balances with third parties", "In Review", "Low", 4],
];

const DAY = 864e5;
const password = () => {
    const pool = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const sym = "@#$%&*";
    const body = Array.from(crypto.randomBytes(10), (b) => pool[b % pool.length]).join("");
    return `${body.slice(0, 4)}${sym[crypto.randomInt(sym.length)]}${body.slice(4)}${crypto.randomInt(10)}`;
};

const seed = async () => {
    for (const [name, department] of [["HR", "Human Resources"], ["Accounts", "Accounts & Finance"]]) {
        if (!(await Designation.exists({ name }))) {
            const d = await Designation.create({ name, department, status: "Active", description: "Added for demo teams" });
            await Designation.collection.updateOne({ _id: d._id }, { $set: { demoTeam: true } });
        }
    }

    const byEmail = async () => new Map((await Employee.find({}).select("_id email manager").lean()).map((e) => [e.email, e]));
    let people = await byEmail();
    const taken = await Employee.find({}).select("employeeId phoneNumber").lean();
    const ids = new Set(taken.map((t) => t.employeeId));
    const phones = new Set(taken.map((t) => t.phoneNumber));
    let n = 101;
    const nextId = () => { while (ids.has(`AST${n}`)) n++; ids.add(`AST${n}`); return `AST${n++}`; };
    let ph = 9000010100;
    const nextPhone = () => { while (phones.has(String(ph))) ph++; phones.add(String(ph)); return String(ph++); };

    const created = [];
    for (const [first, last, designation, department, , gender] of NEW_PEOPLE) {
        const email = `${first}.${last}`.toLowerCase() + "@astral.test";
        if (people.has(email)) continue;
        const pw = password();
        const e = await Employee.create({
            employeeId: nextId(), userName: `${first}.${last}`.toLowerCase(), firstName: first, lastName: last, gender,
            dateOfBirth: new Date(1990 + (first.length % 9), first.length % 12, 5 + last.length), email, phoneNumber: nextPhone(),
            role: defaultRoleFor(designation) || "Employee", designation, department,
            joiningDate: new Date(Date.now() - (60 + first.length * 20) * DAY), employmentType: "Permanent",
            salary: { Manager: 120000, "Senior Consultant": 85000, Consultant: 60000, "Junior Consultant": 40000, Associate: 25000, HR: 45000, Accounts: 45000 }[designation] || 40000,
            password: await bcrypt.hash(pw, 10), status: "Active",
        });
        await Employee.collection.updateOne({ _id: e._id }, { $set: { demoTeam: true } });
        await LeaveBalance.create({ employeeId: e._id });
        created.push({ name: `${first} ${last}`, designation, department, email, password: pw });
    }
    people = await byEmail();

    // reporting lines: new people, then existing people moved into teams
    const lines = [...NEW_PEOPLE.map(([f, l, , , boss]) => [`${f}.${l}`.toLowerCase() + "@astral.test", boss]), ...Object.entries(MOVES)];
    let moved = 0;
    for (const [email, bossEmail] of lines) {
        const e = people.get(email), boss = people.get(bossEmail);
        if (!e || !boss || String(e.manager || "") === String(boss._id)) continue;
        const raw = await Employee.collection.findOne({ _id: e._id }, { projection: { demoTeam: 1, demoPrevManager: 1 } });
        const set = { manager: boss._id };
        if (!raw.demoTeam && !("demoPrevManager" in raw)) set.demoPrevManager = e.manager || null;
        await Employee.collection.updateOne({ _id: e._id }, { $set: set });
        moved++;
    }

    // one project per squad, with tasks for its people
    let projects = 0;
    for (const [code, name, client, leadEmail, members, status] of PROJECTS) {
        if (await Project.exists({ projectCode: code })) continue;
        const lead = people.get(leadEmail);
        const team = members.map((m) => people.get(m)).filter(Boolean);
        if (!lead) continue;
        const p = await Project.create({
            projectCode: code, projectName: name, clientName: client, projectManager: lead._id, teamMembers: team.map((t) => t._id),
            startDate: new Date(Date.now() - 14 * DAY), endDate: new Date(Date.now() + (20 + projects * 4) * DAY), status, priority: projects % 3 === 0 ? "High" : "Medium",
            workMode: "Client site", estimatedHours: 120 + projects * 10, description: "Demo team project.", createdBy: lead.manager || lead._id,
            location: { siteName: client, address: "Coimbatore, Tamil Nadu" },
        });
        await Task.insertMany(TASKS.map(([title, st, priority, due], i) => ({
            title, projectId: p._id, assignedTo: (team[i % Math.max(team.length, 1)] || lead)._id, status: st, priority,
            dueDate: new Date(Date.now() + due * DAY), createdBy: lead._id, order: i + 1, completedAt: st === "Done" ? new Date() : null,
        })));
        projects++;
    }

    console.log(`Added ${created.length} people, set ${moved} reporting lines, created ${projects} squad projects.`);
    if (created.length) console.log("NEW_ACCOUNTS " + JSON.stringify(created));
};

const clean = async () => {
    const demo = await Employee.collection.find({ demoTeam: true }).project({ _id: 1 }).toArray();
    const ids = demo.map((d) => d._id);
    const projects = await Project.find({ projectCode: /^DT-/ }).select("_id").lean();
    const pids = projects.map((p) => p._id);
    const [t, l, pr] = await Promise.all([Task.deleteMany({ projectId: { $in: pids } }), ProjectTimeLog.deleteMany({ projectId: { $in: pids } }), Project.deleteMany({ _id: { $in: pids } })]);
    // put old reporting lines back
    const movedPeople = await Employee.collection.find({ demoPrevManager: { $exists: true } }).toArray();
    for (const e of movedPeople) await Employee.collection.updateOne({ _id: e._id }, { $set: { manager: e.demoPrevManager }, $unset: { demoPrevManager: "" } });
    await Promise.all([LeaveBalance.deleteMany({ employeeId: { $in: ids } }), Notification.deleteMany({ employeeId: { $in: ids } }), Employee.collection.deleteMany({ _id: { $in: ids } }), Designation.collection.deleteMany({ demoTeam: true })]);
    console.log(`Removed ${ids.length} people, ${pr.deletedCount} projects, ${t.deletedCount} tasks, ${l.deletedCount} time logs; restored ${movedPeople.length} reporting lines.`);
};

const cmd = process.argv[2];
if (!["seed", "clean"].includes(cmd)) { console.log("Usage: node scripts/demoTeams.js seed | clean"); process.exit(1); }
await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
try { await (cmd === "seed" ? seed() : clean()); } finally { await mongoose.disconnect(); }
