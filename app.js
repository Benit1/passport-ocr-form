// app.js - JavaScript for the Passport OCR web app
const $ = (id) => document.getElementById(id);
const statusBox = $("status");
const fileInput = $("file");
const scanBtn = $("scanBtn");
const preview = $("preview");

const out = {
    surname: $("surname"),
    given: $("given"),
    number: $("number"),
    nationality: $("nationality"),
    birth: $("birth"),
    sex: $("sex"),
    expiry: $("expiry"),
    issuing: $("issuing"),
};

fileInput.addEventListener("change", () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    preview.src = url;
    preview.style.display = "block";
    statusBox.textContent = "תמונה נטענה. לחץ/י על 'סרוק מהתמונה'.";
});

scanBtn.addEventListener("click", async () => {
    const f = fileInput.files?.[0];
    if (!f) return alert("בחר/י תמונה של דרכון קודם.");

    try {
        scanBtn.disabled = true;
        statusBox.textContent = "שולח ל-Google Vision…";

        const base64 = await fileToBase64(f);
        const ocr = await callVision(base64);
        const text = ocr?.responses?.[0]?.fullTextAnnotation?.text || "";
        if (!text.trim()) {
            statusBox.textContent = "לא זוהה טקסט. נסו תמונה חדה יותר.";
            scanBtn.disabled = false;
            return;
        }

        const parsed = parseMRZ(text);
        fillForm(parsed);

        statusBox.textContent = "מוכן! בדקו ותקנו אם צריך.";
    } catch (e) {
        console.error(e);
        statusBox.textContent = "שגיאה בקריאה ל-Vision. ודאו API Key ושה-Billing פעיל.";
    } finally {
        scanBtn.disabled = false;
    }
});

function fileToBase64(file) {
    return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => {
            // התוצאה כוללת "data:image/jpeg;base64,...."
            const str = reader.result.toString();
            const b64 = str.split(",")[1] || str; // גזור רק את ה-base64
            res(b64);
        };
        reader.onerror = rej;
        reader.readAsDataURL(file);
    });
}

async function callVision(base64Content) {
    if (!window.VISION_API_KEY || window.VISION_API_KEY.startsWith("PASTE_")) {
        throw new Error("חסר API Key ב-index.html");
    }
    const body = {
        requests: [
            {
                image: { content: base64Content },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
                imageContext: { languageHints: ["en", "he"] },
            },
        ],
    };

    const resp = await fetch(
        "https://vision.googleapis.com/v1/images:annotate?key=" + window.VISION_API_KEY,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }
    );
    if (!resp.ok) throw new Error("Vision HTTP " + resp.status);
    return resp.json();
}


function parseMRZ(fullText) {
    const lines = fullText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);


    let L1 = "", L2 = "";
    for (let i = 0; i < lines.length - 1; i++) {
        const a = lines[i].replace(/\s+/g, "");
        const b = lines[i + 1].replace(/\s+/g, "");
        if (a.length >= 40 && b.length >= 40 && a.includes("<") && b.includes("<")) {
            L1 = a; L2 = b; break;
        }
    }

    const out = {
        surname: "", given_names: "",
        passport_number: "", nationality: "",
        birth_date: "", sex: "", expiry_date: "",
        issuing_country: "",
    };

    function yymmddToISO(s) {
        if (!/^\d{6}$/.test(s)) return "";
        const yy = parseInt(s.slice(0,2),10);
        const mm = parseInt(s.slice(2,4),10);
        const dd = parseInt(s.slice(4,6),10);
        const century = yy <= 29 ? 2000 : 1900;
        const d = new Date(century + yy, mm - 1, dd);
        if (isNaN(d.getTime())) return "";
        const m = String(mm).padStart(2,"0");
        const day = String(dd).padStart(2,"0");
        return `${century + yy}-${m}-${day}`;
    }

    if (L1 && L2) {
        try {
            // L1: P<GBRSMITH<<JOHN<ALBERT<<<<<<<<<<<<<<<<<<<<
            out.issuing_country = L1.slice(2,5).replace(/</g,"");
            const nameField = L1.slice(5);
            if (nameField.includes("<<")) {
                const [sur, given] = nameField.split("<<", 1).concat(nameField.split("<<").slice(1).join("<<"));
                out.surname = nameField.split("<<")[0].replace(/</g," ").trim();
                out.given_names = nameField.split("<<")[1].replace(/</g," ").trim();
            }

            // L2: 1234567890GBR8001019M2501012<<<<<<<<<<<<<<04
            out.passport_number = L2.slice(0, 9).replace(/</g, "");
            out.nationality = L2.slice(10, 13).replace(/</g, "");
            out.birth_date = yymmddToISO(L2.slice(13, 19));
            const sex = L2.slice(20, 21);
            out.sex = sex === "M" ? "Male" : sex === "F" ? "Female" : "";
            out.expiry_date = yymmddToISO(L2.slice(21, 27));
        } catch (e) {
            console.warn("MRZ parse error", e);
        }
    }
    return out;
}

function fillForm(p) {
    out.surname.value      = p.surname || "";
    out.given.value        = p.given_names || "";
    out.number.value       = p.passport_number || "";
    out.nationality.value  = p.nationality || "";
    out.birth.value        = p.birth_date || "";
    out.sex.value          = p.sex || "";
    out.expiry.value       = p.expiry_date || "";
    out.issuing.value      = p.issuing_country || "";
}
