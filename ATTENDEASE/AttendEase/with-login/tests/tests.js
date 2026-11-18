// Automated tests for the AttendEase data rules.   Run:  node tests/tests.js
const assert = require("assert");
const Data = require("../data.js");

let passed = 0;
function test(name, body) {
  try { body(); passed++; console.log("  ok   " + name); }
  catch (err) { console.log("  FAIL " + name + "\n       " + err.message); process.exitCode = 1; }
}
const throwsWith = (fn, text) => assert.throws(fn, (err) => err.message.includes(text));

function freshStore() {
  const store = Data.createStore();
  store.replaceAll({ courses: [], students: [], enrollments: [], sheets: [] });
  store.addCourse({ program: "bscs", name: "Programming", code: "cs101", block: "bscs 1a", days: [1, 4], start: "09:00", end: "10:30" });
  store.addCourse({ program: "bsit", name: "Web", code: "it102", block: "bsit 1a" });
  return store;
}

console.log("Courses");
test("addCourse cleans and uppercases fields", () => {
  const c = freshStore().state.courses[0];
  assert.deepStrictEqual([c.program, c.code, c.block], ["BSCS", "CS101", "BSCS 1A"]);
});
test("addCourse blocks duplicates and missing fields", () => {
  const store = freshStore();
  throwsWith(() => store.addCourse({ program: "BSCS", name: "programming", code: "x", block: "BSCS 1A" }), "already exists");
  throwsWith(() => store.addCourse({ program: "", name: "A", code: "B", block: "C" }), "fill in all");
});
test("course times must make sense", () => {
  const store = freshStore();
  throwsWith(() => store.addCourse({ program: "A", name: "B", code: "C", block: "D", start: "10:00", end: "09:00" }), "end after");
  throwsWith(() => store.addCourse({ program: "A", name: "B", code: "C", block: "D", start: "10:00" }), "both");
});

console.log("Students are stored once");
test("same student ID in two classes is ONE student", () => {
  const store = freshStore();
  store.addStudent(1, { studentNumber: "100", lastName: "Reyes", firstName: "Ana" });
  store.addStudent(2, { studentNumber: "100", lastName: "Reyes", firstName: "Ana" });
  assert.strictEqual(store.state.students.length, 1);
  assert.strictEqual(store.state.enrollments.length, 2);
});
test("editing a student changes them everywhere", () => {
  const store = freshStore();
  const s = store.addStudent(1, { studentNumber: "100", lastName: "Reyes", firstName: "Ana" });
  store.addStudent(2, { studentNumber: "100", lastName: "Reyes", firstName: "Ana" });
  store.updateStudent(s.id, { studentNumber: "100", lastName: "Santos", firstName: "Ana" });
  assert.strictEqual(store.studentsOf(1)[0].lastName, "Santos");
  assert.strictEqual(store.studentsOf(2)[0].lastName, "Santos");
});
test("duplicate in the same class is refused", () => {
  const store = freshStore();
  store.addStudent(1, { studentNumber: "100", lastName: "A", firstName: "B" });
  throwsWith(() => store.addStudent(1, { studentNumber: "100", lastName: "A", firstName: "B" }), "already in this class");
});
test("removing from one class keeps the other class", () => {
  const store = freshStore();
  const s = store.addStudent(1, { studentNumber: "100", lastName: "A", firstName: "B" });
  store.addStudent(2, { studentNumber: "100", lastName: "A", firstName: "B" });
  store.removeStudent(1, s.id);
  assert.strictEqual(store.studentsOf(1).length, 0);
  assert.strictEqual(store.studentsOf(2).length, 1);
  store.removeStudent(2, s.id);
  assert.strictEqual(store.state.students.length, 0);
});
test("deleteCourse removes its sheets and students with no class left", () => {
  const store = freshStore();
  const s = store.addStudent(1, { studentNumber: "100", lastName: "A", firstName: "B" });
  store.saveSheet(1, "2026-11-02", [{ studentId: s.id, status: "present" }]);
  store.deleteCourse(1);
  assert.deepStrictEqual([store.state.sheets.length, store.state.students.length, store.state.enrollments.length], [0, 0, 0]);
});
test("ids are never reused after a delete", () => {
  const store = freshStore();
  const a = store.addStudent(1, { studentNumber: "1", lastName: "A", firstName: "A" });
  store.removeStudent(1, a.id);
  const b = store.addStudent(1, { studentNumber: "2", lastName: "B", firstName: "B" });
  assert.ok(b.id > a.id);
});

console.log("Attendance sheets");
test("saveSheet creates, then updates the same sheet", () => {
  const store = freshStore();
  const s = store.addStudent(1, { studentNumber: "1", lastName: "A", firstName: "A" });
  const first = store.saveSheet(1, "2026-11-02", [{ studentId: s.id, status: "present" }]);
  const second = store.saveSheet(1, "2026-11-02", [{ studentId: s.id, status: "excused" }]);
  assert.deepStrictEqual([first.updated, second.updated, store.state.sheets.length], [false, true, 1]);
  assert.strictEqual(store.state.sheets[0].records[0].status, "excused");
});
test("saveSheet refuses bad dates, empty marks and unknown statuses", () => {
  const store = freshStore();
  const rec = [{ studentId: 1, status: "present" }];
  throwsWith(() => store.saveSheet(1, "11/02/2026", rec), "valid date");
  throwsWith(() => store.saveSheet(1, "2026-11-02", []), "missing");
  throwsWith(() => store.saveSheet(1, "2026-11-02", [{ studentId: 1, status: "sick" }]), "not valid");
});
test("date range edit changes only that student inside the range", () => {
  const store = freshStore();
  const a = store.addStudent(1, { studentNumber: "1", lastName: "A", firstName: "A" });
  const b = store.addStudent(1, { studentNumber: "2", lastName: "B", firstName: "B" });
  ["2026-11-02", "2026-11-03", "2026-11-09"].forEach((d) => store.saveSheet(1, d, [{ studentId: a.id, status: "absent" }, { studentId: b.id, status: "absent" }]));
  const changed = store.setStatusInRange({ studentId: a.id, from: "2026-11-02", to: "2026-11-06", status: "excused" });
  assert.strictEqual(changed, 2);
  assert.strictEqual(store.statsFor(a.id).excused, 2);
  assert.strictEqual(store.statsFor(b.id).excused, 0);
  throwsWith(() => store.setStatusInRange({ studentId: a.id, from: "2026-11-06", to: "2026-11-02", status: "late" }), "not be after");
});

console.log("Import");
test("importStudents skips the header, blanks and duplicates", () => {
  const store = freshStore();
  const result = store.importStudents(1, [["Student ID", "Last Name", "First Name"], ["1", "Reyes", "Ana"], ["", "", ""], ["1", "Reyes", "Ana"], ["2", "Dela Cruz", ""], ["3", "Ng", "Bea"]]);
  assert.deepStrictEqual(result, { added: 2, skipped: 2 });
});

console.log("Numbers and saved data");
test("attendance rate counts late as attending and ignores excused", () => {
  assert.strictEqual(Data.attendanceRate({ present: 6, late: 2, excused: 5, absent: 2 }), 80);
  assert.strictEqual(Data.attendanceRate({ present: 0, late: 0, excused: 3, absent: 0 }), null);
});
test("old data (a copy of the student in each class) migrates to one student", () => {
  const old = { courses: [{ id: 1, program: "A", name: "n", code: "c", block: "b" }, { id: 2, program: "A", name: "m", code: "d", block: "e" }],
    students: [{ id: 1, courseId: 1, studentNumber: "9", lastName: "X", firstName: "Y" }, { id: 2, courseId: 2, studentNumber: "9", lastName: "X", firstName: "Y" }],
    sheets: [{ id: 1, courseId: 2, date: "2026-11-02", records: [{ studentId: 2, status: "late" }] }] };
  assert.ok(Data.isValidData(old));
  const store = Data.createStore();
  store.replaceAll(old);
  assert.strictEqual(store.state.students.length, 1);
  assert.strictEqual(store.state.sheets[0].records[0].studentId, store.state.students[0].id);
});
test("isValidData rejects broken files", () => {
  assert.ok(!Data.isValidData(null));
  assert.ok(!Data.isValidData({ courses: [{}], students: [], sheets: [] }));
});
test("undo: snapshot and restore bring the data back", () => {
  const store = freshStore();
  const before = store.snapshot();
  store.addStudent(1, { studentNumber: "1", lastName: "A", firstName: "A" });
  store.restore(before);
  assert.strictEqual(store.state.students.length, 0);
});

console.log("Excel export");
test("buildXlsx makes a zip with the sheet inside", () => {
  const bytes = Data.buildXlsx([["Date", "Name"], ["2026-11-02", "A & B"]], "Attendance");
  const text = Buffer.from(bytes).toString("latin1");
  assert.strictEqual(text.slice(0, 2), "PK");
  ["xl/worksheets/sheet1.xml", "xl/workbook.xml", "A &amp; B"].forEach((part) => assert.ok(text.includes(part), part));
});

console.log("\n" + passed + " tests passed" + (process.exitCode ? ", some FAILED" : ""));
