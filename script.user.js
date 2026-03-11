// ==UserScript==
// @name         VLR.gg Scraper by Nyang & Dollyzn
// @namespace    https://github.com/notyangcode/vlrscrapper
// @version      1.0
// @description  Picks&Bans, Stats e Pistols em uma única interface pra análise de dados.
// @author       Nyang & dollyzn
// @match        https://www.vlr.gg/*
// @match        https://vlr.gg/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=vlr.gg
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

// =============================================================================

(function () {
    "use strict";

    // =========================================================================
    // MÓDULO DE STORAGE SEGURO (VUL-02, VUL-06, VUL-07)
    // Usa GM_getValue/GM_setValue em vez de localStorage/sessionStorage.
    // Esses métodos são isolados da página e não acessíveis por scripts externos.
    // =========================================================================
    const SecureStorage = {
        get(key, defaultVal = null) {
            try {
                const raw = GM_getValue(key, null);
                if (raw === null) return defaultVal;
                // [VUL-05] Valida que o JSON retornado é um objeto plano antes de usar
                const parsed = JSON.parse(raw);
                if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
                    return defaultVal;
                }
                // Remove chaves especiais de prototype pollution
                // [FIX] Usa hasOwnProperty em vez de `in` — o operador `in` verifica a cadeia
                // de protótipos e retorna true para `constructor` em QUALQUER objeto plano,
                // o que fazia o storage descartar todos os dados salvos incorretamente.
                const hop = Object.prototype.hasOwnProperty;
                if (hop.call(parsed, "__proto__") || hop.call(parsed, "constructor") || hop.call(parsed, "prototype")) {
                    console.warn("[VLR-SEC] Dado suspeito descartado do storage:", key);
                    return defaultVal;
                }
                return parsed;
            } catch (e) {
                return defaultVal;
            }
        },
        set(key, data) {
            try {
                if (typeof data !== "object" || data === null) return;
                GM_setValue(key, JSON.stringify(data));
            } catch (e) {
                console.error("[VLR-SEC] Erro ao salvar no storage seguro:", e);
            }
        },
        // Para arrays (lastResults), trata separadamente pois não são objetos planos
        getArray(key) {
            try {
                const raw = GM_getValue(key, null);
                if (raw === null) return [];
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) return [];
                // [REM-03] Valida itens do array contra prototype pollution
                const hop = Object.prototype.hasOwnProperty;
                return parsed.filter(item => {
                    if (typeof item !== "object" || item === null) return true;
                    return !hop.call(item, "__proto__") && !hop.call(item, "constructor") && !hop.call(item, "prototype");
                });
            } catch (e) {
                return [];
            }
        },
        setArray(key, arr) {
            try {
                if (!Array.isArray(arr)) return;
                GM_setValue(key, JSON.stringify(arr));
            } catch (e) {
                console.error("[VLR-SEC] Erro ao salvar array no storage seguro:", e);
            }
        }
    };

    // =========================================================================
    // HELPERS DE SEGURANÇA GLOBAIS
    // =========================================================================

    // [VUL-01] escapeHtml: aceita qualquer tipo, SEMPRE retorna string segura
    function escapeHtml(text) {
        if (text === null || text === undefined) return "";
        const str = String(text);
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // [VUL-01] safeNum: garante que valores exibidos em HTML são numéricos
    function safeNum(val) {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    }

    // [VUL-03] safeHexColor: valida formato #RRGGBB antes de usar em style=""
    function safeHexColor(color) {
        if (typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) {
            return color;
        }
        return "#aaaaaa"; // fallback seguro
    }

    // [VUL-09 / VUL-16] assertVlrUrl: bloqueia fetches para domínios não-vlr.gg
    function assertVlrUrl(url) {
        try {
            const u = new URL(url);
            if (u.hostname !== "www.vlr.gg" || u.protocol !== "https:") {
                throw new Error(`[VLR-SEC] URL não autorizada bloqueada: ${url}`);
            }
            return url;
        } catch (e) {
            if (e.message.startsWith("[VLR-SEC]")) throw e;
            throw new Error(`[VLR-SEC] URL inválida: ${url}`);
        }
    }

    // =========================================================================
    // CONFIGURAÇÃO DA UI MESTRE (JANELA ÚNICA)
    // =========================================================================

    function createMasterUI() {
        // [VUL-12] Prefixo longo para evitar colisão de IDs com a página host
        if (document.getElementById("vlru__unified-ui")) return;

        const UI_STATE_KEY = "vlru_ui_open";
        const UI_TAB_KEY = "vlru_ui_tab";

        // [VUL-02] Lê estado da UI via storage isolado
        const isInitiallyOpen = GM_getValue(UI_STATE_KEY, "false") === "true";
        const initialTab = parseInt(GM_getValue(UI_TAB_KEY, "1")) || 1;

        // 1. Botão Flutuante
        const floatingBtn = document.createElement("div");
        floatingBtn.id = "vlru__unified-btn";
        floatingBtn.textContent = "📊"; // [VUL-01] textContent em vez de innerHTML
        floatingBtn.title = "VLR Unified Tools";
        floatingBtn.style.cssText = `
            position: fixed !important; right: 20px !important; bottom: 20px !important;
            z-index: 2147483647 !important; width: 60px; height: 60px; border-radius: 50%;
            background: linear-gradient(135deg, #ff4655 0%, #111 100%);
            border: 2px solid #fff; color: white; font-size: 28px; display: flex;
            align-items: center; justify-content: center; cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.7); transition: all 0.3s ease; user-select: none;
        `;
        floatingBtn.onmouseenter = () => { floatingBtn.style.transform = "scale(1.1)"; };
        floatingBtn.onmouseleave = () => { floatingBtn.style.transform = "scale(1)"; };
        document.body.appendChild(floatingBtn);

        // 2. Container Principal
        const container = document.createElement("div");
        container.id = "vlru__unified-ui";
        container.style.cssText = `
            position: fixed; right: 85px; bottom: 20px; z-index: 999999;
            background: #1a1a1a; border: 1px solid #444; border-radius: 12px;
            width: 460px; max-height: 85vh; flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px; color: #e0e0e0; box-shadow: 0 8px 32px rgba(0,0,0,0.8);
            display: ${isInitiallyOpen ? "flex" : "none"};
        `;

        // 3. Cabeçalho e Abas — construídos programaticamente para evitar innerHTML com dados externos
        const header = document.createElement("div");
        header.id = "vlru__master-header";
        header.style.cssText = "background:#111; padding:10px 15px; border-radius:12px 12px 0 0; border-bottom:1px solid #333; display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none;";

        const headerTitle = document.createElement("div");
        headerTitle.style.cssText = "font-weight:bold; color:#ff4655;";
        headerTitle.textContent = "VLR.gg Scrapper by Nyang e Dollyzn"; // [VUL-01] textContent
        header.appendChild(headerTitle);

        const closeBtn = document.createElement("button");
        closeBtn.id = "vlru__master-close";
        closeBtn.style.cssText = "background:none; border:none; color:#999; font-size:18px; cursor:pointer;";
        closeBtn.textContent = "✖"; // [VUL-01] textContent
        header.appendChild(closeBtn);
        container.appendChild(header);

        // Barra de abas
        const tabBar = document.createElement("div");
        tabBar.style.cssText = "display:flex; background:#222; border-bottom:1px solid #333;";

        function makeTabBtn(id, label) {
            const btn = document.createElement("button");
            btn.id = id;
            btn.style.cssText = "flex:1; padding:10px; background:#1a1a1a; color:#888; border:none; border-bottom: 2px solid transparent; cursor:pointer; font-weight:bold; font-size:12px;";
            btn.textContent = label; // [VUL-01] textContent
            return btn;
        }

        const tab1 = makeTabBtn("vlru__tab-btn-1", "Picks&Bans");
        const tab2 = makeTabBtn("vlru__tab-btn-2", "Stats");
        const tab3 = makeTabBtn("vlru__tab-btn-3", "Pistols");
        tabBar.appendChild(tab1);
        tabBar.appendChild(tab2);
        tabBar.appendChild(tab3);
        container.appendChild(tabBar);

        // Área de conteúdo
        const contentArea = document.createElement("div");
        contentArea.id = "vlru__content-area";
        contentArea.style.cssText = "flex:1; overflow-y:auto; padding:15px; position:relative;";

        const content1 = document.createElement("div");
        content1.id = "vlru__tab-content-1";
        content1.style.display = "block";
        const content2 = document.createElement("div");
        content2.id = "vlru__tab-content-2";
        content2.style.display = "none";
        const content3 = document.createElement("div");
        content3.id = "vlru__tab-content-3";
        content3.style.display = "none";

        contentArea.appendChild(content1);
        contentArea.appendChild(content2);
        contentArea.appendChild(content3);
        container.appendChild(contentArea);
        document.body.appendChild(container);

        // 4. Lógica das Abas
        function switchTab(target) {
            // [VUL-02] Salva via storage isolado
            GM_setValue(UI_TAB_KEY, String(target));
            [tab1, tab2, tab3].forEach(t => {
                t.style.background = "#1a1a1a";
                t.style.color = "#888";
                t.style.borderBottom = "2px solid transparent";
            });
            [content1, content2, content3].forEach(c => c.style.display = "none");

            if (target === 1) {
                content1.style.display = "block";
                tab1.style.background = "#2a2a2a"; tab1.style.color = "#fff"; tab1.style.borderBottom = "2px solid #ff4655";
            } else if (target === 2) {
                content2.style.display = "block";
                tab2.style.background = "#2a2a2a"; tab2.style.color = "#fff"; tab2.style.borderBottom = "2px solid #ff4655";
            } else if (target === 3) {
                content3.style.display = "block";
                tab3.style.background = "#2a2a2a"; tab3.style.color = "#fff"; tab3.style.borderBottom = "2px solid #00bcd4";
            }
        }

        tab1.onclick = () => switchTab(1);
        tab2.onclick = () => switchTab(2);
        tab3.onclick = () => switchTab(3);
        switchTab(initialTab);

        // 5. Abrir/Fechar
        floatingBtn.onclick = () => {
            const isHidden = container.style.display === "none";
            container.style.display = isHidden ? "flex" : "none";
            // [VUL-02] Salva via storage isolado
            GM_setValue(UI_STATE_KEY, String(isHidden));
        };
        closeBtn.onclick = () => {
            container.style.display = "none";
            GM_setValue(UI_STATE_KEY, "false");
        };

        // 6. Drag Logic — [VUL-13] listeners nomeados, registrados uma única vez
        let isDragging = false, startX, startY, initialLeft, initialTop;

        function onMouseMove(e) {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            container.style.left = `${initialLeft + dx}px`;
            container.style.top = `${initialTop + dy}px`;
        }
        function onMouseUp() { isDragging = false; }

        header.addEventListener("mousedown", (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = container.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;
            container.style.right = "auto";
            container.style.bottom = "auto";
        });

        // [VUL-13] Registra listeners no document apenas uma vez com funções nomeadas
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);

        return { root1: content1, root2: content2, root3: content3 };
    }

    const roots = createMasterUI();

    // =========================================================================
    // HELPERS COMPARTILHADOS DE FETCH E PARSING
    // =========================================================================

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function fetchWithTimeout(url, { timeout = 60000 } = {}) {
        // [VUL-16] Valida domínio antes de qualquer fetch
        assertVlrUrl(url);
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            // [REM-02] credentials:omit evita envio de cookies; no-referrer evita vazar contexto de navegação
            const res = await fetch(url, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
            return res;
        } finally {
            clearTimeout(id);
        }
    }

    // [VUL-09 / VUL-16] absoluteUrl: só converte para URLs vlr.gg relativas
    function absoluteUrl(href) {
        if (!href) return null;
        try {
            const full = href.startsWith("http")
                ? href
                : new URL(href, "https://www.vlr.gg").toString();
            // Garante que mesmo URLs absolutas apontam para vlr.gg
            assertVlrUrl(full);
            return full;
        } catch (e) {
            console.warn("[VLR-SEC] absoluteUrl bloqueou URL suspeita:", href);
            return null;
        }
    }

    function parseDateFromText(text) {
        const match = text.match(/(\d{4})\/(\d{2})\/(\d{2})/);
        if (match) return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
        const d = new Date(text);
        return !isNaN(d) ? d : null;
    }

    async function fetchDoc(url) {
        // [VUL-16] assertVlrUrl já é chamado dentro de fetchWithTimeout
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const res = await fetchWithTimeout(url);
                // [REM-05] Não vaza a URL interna na mensagem ao usuário — apenas no console
                if (!res.ok) {
                    console.warn(`[VLR] Fetch ${url} falhou: ${res.status}`);
                    throw new Error(`Erro HTTP ${res.status} ao buscar dados.`);
                }
                const html = await res.text();
                return new DOMParser().parseFromString(html, "text/html");
            } catch (e) {
                lastErr = e;
                await sleep(500 * Math.pow(2, attempt));
            }
        }
        throw lastErr;
    }

    // =========================================================================
    // HELPERS COMPARTILHADOS DE EXTRAÇÃO
    // =========================================================================

    function normalizeTeamName(name) {
        if (!name) return "";
        return name.toLowerCase().replace(/\s+/g, "").replace(/\./g, "").replace(/-/g, "").trim();
    }

    function teamMatches(teamName, filterName) {
        const teamNorm = normalizeTeamName(teamName);
        const filterNorm = normalizeTeamName(filterName);
        return (teamNorm === filterNorm || teamNorm.includes(filterNorm) || filterNorm.includes(teamNorm));
    }

    function extractEventPath(url) {
        if (!url) return null;
        try {
            const urlObj = new URL(url, "https://www.vlr.gg");
            return urlObj.pathname;
        } catch {
            return url.startsWith("/event/") ? url : null;
        }
    }

    function extractTeamNameFromPage(doc) {
        const headerNameDiv = doc.querySelector(".team-header-name");
        if (headerNameDiv) {
            const tagH2 = headerNameDiv.querySelector("h2.team-header-tag");
            if (tagH2) return tagH2.textContent.trim();
            const titleH1 = headerNameDiv.querySelector("h1.wf-title");
            if (titleH1) {
                let text = "";
                for (const node of titleH1.childNodes) {
                    if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
                    else if (node.tagName === "SPAN" && !node.classList.contains("tag")) text += node.textContent;
                }
                return text.trim();
            }
        }
        const titleEl = doc.querySelector("h1.wf-title");
        if (titleEl) {
            let text = "";
            for (const node of titleEl.childNodes) {
                if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
                else if (node.tagName === "SPAN" && !node.classList.contains("tag")) text += node.textContent;
            }
            return text.trim();
        }
        return null;
    }

    function getMaxPage(doc) {
        const pageLinks = doc.querySelectorAll(".action-container-pages a.btn.mod-page, .action-container-pages span.btn.mod-page");
        let maxPage = 1;
        for (const link of pageLinks) {
            const pageNum = parseInt(link.textContent.trim());
            if (!isNaN(pageNum) && pageNum > maxPage) maxPage = pageNum;
        }
        return maxPage;
    }

    function extractMatchesFromContainer(doc) {
        const matches = [];
        const matchCards = doc.querySelectorAll(".wf-card.fc-flex.m-item");
        for (const card of matchCards) {
            const linkEl = card.tagName === "A" ? card : card.querySelector("a[href]");
            if (!linkEl) continue;
            const href = linkEl.getAttribute("href");
            if (!href || !href.match(/^\/\d+\//)) continue;
            // [VUL-16] absoluteUrl já valida domínio internamente
            const safeUrl = absoluteUrl(href);
            if (!safeUrl) continue;
            let matchDate = null;
            const dateEl = card.querySelector(".m-item-date");
            if (dateEl) matchDate = parseDateFromText(dateEl.textContent.trim());
            matches.push({ url: safeUrl, date: matchDate });
        }
        return matches;
    }

    async function fetchAllMatchesPages(baseUrl, maxMatches) {
        const allMatches = [];
        const firstPageDoc = await fetchDoc(baseUrl);
        allMatches.push(...extractMatchesFromContainer(firstPageDoc));
        const totalPages = getMaxPage(firstPageDoc);
        if (totalPages > 1) {
            for (let page = 2; page <= totalPages; page++) {
                if (allMatches.length >= maxMatches) break;
                try {
                    const pageDoc = await fetchDoc(`${baseUrl}&page=${page}`);
                    allMatches.push(...extractMatchesFromContainer(pageDoc));
                    await sleep(500);
                } catch (err) {
                    console.warn(`Erro ao buscar página ${page}: ${err.message}`);
                }
            }
        }
        return allMatches;
    }

    async function navigateToMatchesTab(teamUrl) {
        const u = new URL(teamUrl, "https://www.vlr.gg");
        const m = u.pathname.match(/\/team\/(\d+)\/([^/?#]+)/);
        if (!m) throw new Error("URL do time inválida");
        // [VUL-16] Constrói URL apenas com segmentos validados pelo regex acima
        const id = encodeURIComponent(m[1]);
        const slug = encodeURIComponent(m[2]);
        return `https://www.vlr.gg/team/matches/${id}/${slug}?group=completed`;
    }

    function checkEventFilter(doc, eventFilterPath) {
        if (!eventFilterPath) return true;
        const eventLinkEl = doc.querySelector('a.match-header-event[href^="/event"]');
        if (!eventLinkEl) return false;
        const normalize = (path) => path.replace(/\/$/, "").toLowerCase();
        const matchEventPath = normalize(eventLinkEl.getAttribute("href"));
        const filterPath = normalize(eventFilterPath);
        return (matchEventPath.startsWith(filterPath) || filterPath.startsWith(matchEventPath));
    }

    // =========================================================================
    // SCRIPT 1: Scraper Comparativo — Picks & Bans
    // =========================================================================
    (function (rootElement) {
        console.log(">> Iniciando Módulo: Scraper Comparativo");

        const STORAGE_KEY = "vlru_picks_state";
        const STORAGE_RESULTS_KEY = "vlru_picks_results";

        // [VUL-02 / VUL-05] saveState/loadState via storage isolado com validação de schema
        function saveState(data) {
            SecureStorage.set(STORAGE_KEY, data);
        }
        function loadState() {
            return SecureStorage.get(STORAGE_KEY, {});
        }
        function saveResults(arr) {
            SecureStorage.setArray(STORAGE_RESULTS_KEY, arr);
        }
        function loadResults() {
            return SecureStorage.getArray(STORAGE_RESULTS_KEY);
        }

        function extractPicksBansFromMatchPage(doc, filterTeamName) {
            let pickBanString = "";
            const candidates = Array.from(doc.querySelectorAll(".match-veto, .m-veto, .veto, .match-header-note, .match-header-vs-note"));
            for (const el of candidates) {
                const t = (el.textContent || "").toLowerCase();
                if (t.includes("pick") || t.includes("ban") || t.includes("veto")) {
                    pickBanString = (el.textContent || "").trim();
                    break;
                }
            }
            if (!pickBanString) {
                const allText = doc.body.textContent || "";
                const lines = allText.split("\n");
                for (const line of lines) {
                    const lower = line.toLowerCase();
                    if ((lower.includes("pick") || lower.includes("ban") || lower.includes("veto")) && line.includes(";")) {
                        pickBanString = line.trim();
                        break;
                    }
                }
            }
            if (!pickBanString) return null;

            const actions = [];
            const parts = pickBanString.split(/[;,]/).map((s) => s.trim());
            for (const part of parts) {
                const normalized = part.replace(/\bveto\b/gi, "ban");
                const match = normalized.match(/(.*?)\s+(ban|pick)\s+(.*)/i);
                if (match) {
                    let team = match[1].trim().replace(/\./g, " ").replace(/\s+/g, " ");
                    const action = match[2].toLowerCase();
                    let map = match[3].trim();
                    map = map.charAt(0).toUpperCase() + map.slice(1).toLowerCase();
                    if (teamMatches(team, filterTeamName)) actions.push({ team, action, map });
                }
            }
            return actions;
        }

        function extractEventName(doc) {
            const eventEl = doc.querySelector(".match-header-event-series, .match-header-event .text-of");
            return eventEl ? eventEl.textContent.trim() : "N/A";
        }

        async function analyzeMatches(options = {}, progressPrefix = "") {
            const { teamUrl, eventFilterUrl, fromDate, toDate, maxMatches = 100 } = options;
            if (!teamUrl) throw new Error("❌ URL do time é obrigatória!");

            const eventFilterPath = eventFilterUrl ? extractEventPath(eventFilterUrl) : null;
            const teamDoc = await fetchDoc(teamUrl);
            const teamName = extractTeamNameFromPage(teamDoc);
            if (!teamName) throw new Error("❌ Não foi possível extrair o nome do time");

            const matchesUrl = await navigateToMatchesTab(teamUrl);
            const matchList = await fetchAllMatchesPages(matchesUrl, maxMatches);
            if (matchList.length === 0) throw new Error("❌ Nenhum match encontrado");

            let filteredByDate = matchList;
            if (fromDate || toDate) {
                filteredByDate = matchList.filter((m) => {
                    if (!m.date) return true;
                    if (fromDate && m.date < fromDate) return false;
                    if (toDate && m.date > toDate) return false;
                    return true;
                });
            }

            const toProcess = filteredByDate.slice(0, maxMatches);
            const teamStats = { pick: 0, ban: 0, matches: 0 };
            const aggregatedByMap = {};
            const filteredOut = { event: 0, noData: 0 };

            // [VUL-12] ID com prefixo único
            const progressEl = document.getElementById("vlru__scr_progress");

            for (let i = 0; i < toProcess.length; i++) {
                const matchInfo = toProcess[i];
                if (progressEl) {
                    const prefix = progressPrefix ? `[${progressPrefix}] ` : "";
                    // [VUL-01] textContent em vez de innerHTML para mensagens de progresso
                    progressEl.textContent = `${prefix}Analisando match ${i + 1} de ${toProcess.length}...`;
                }
                try {
                    const matchDoc = await fetchDoc(matchInfo.url);
                    if (eventFilterPath && !checkEventFilter(matchDoc, eventFilterPath)) {
                        filteredOut.event++;
                        continue;
                    }
                    const actions = extractPicksBansFromMatchPage(matchDoc, teamName);
                    if (!actions || actions.length === 0) {
                        filteredOut.noData++;
                        continue;
                    }
                    for (const action of actions) {
                        teamStats[action.action]++;
                        const map = action.map;
                        if (!aggregatedByMap[map]) aggregatedByMap[map] = { pick: 0, ban: 0 };
                        aggregatedByMap[map][action.action]++;
                    }
                    teamStats.matches++;
                    await sleep(400);
                } catch (err) {
                    console.warn(`Erro: ${err.message}`);
                }
            }
            return { teamName, teamStats, aggregatedByMap, filteredOut, filterEvent: eventFilterPath };
        }

        // [VUL-14] initUI com verificação explícita em vez de setTimeout cego
        function initUI() {
            if (!rootElement) return;

            const savedConfig = loadState();
            const savedResults = loadResults();

            // Constrói a UI programaticamente para o formulário
            rootElement.innerHTML = `
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-size:12px;color:#aaa;">URL do Time 1 <span style="color:#ff4655;">*</span></label>
                    <input id="vlru__scr_team" placeholder="Ex: https://www.vlr.gg/team/6961/loud" style="width:100%;padding:8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#fff;box-sizing:border-box;"/>
                </div>
                <div style="margin-bottom:16px;">
                    <label style="display:block;margin-bottom:4px;font-size:12px;color:#aaa;">URL do Evento (Time 1) - Opcional</label>
                    <input id="vlru__scr_event1" placeholder="Filtrar Time 1 por evento..." style="width:100%;padding:8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#fff;box-sizing:border-box;"/>
                </div>
                <hr style="border:0;border-top:1px dashed #444;margin:15px 0;">
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-size:12px;color:#aaa;">URL do Time 2 (Opcional)</label>
                    <input id="vlru__scr_team2" placeholder="Ex: https://www.vlr.gg/team/2593/fnatic" style="width:100%;padding:8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#fff;box-sizing:border-box;"/>
                </div>
                <div style="margin-bottom:16px;">
                    <label style="display:block;margin-bottom:4px;font-size:12px;color:#aaa;">URL do Evento (Time 2) - Opcional</label>
                    <input id="vlru__scr_event2" placeholder="Filtrar Time 2 por evento..." style="width:100%;padding:8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#fff;box-sizing:border-box;"/>
                </div>
                <hr style="border:0;border-top:1px dashed #444;margin:15px 0;">
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    <div style="flex:1;">
                        <label style="font-size:12px;color:#aaa;">De</label>
                        <input id="vlru__scr_from" type="date" style="width:100%;padding:8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#fff;box-sizing:border-box;"/>
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:12px;color:#aaa;">Até</label>
                        <input id="vlru__scr_to" type="date" style="width:100%;padding:8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#fff;box-sizing:border-box;"/>
                    </div>
                </div>
                <div style="margin-bottom:16px;">
                    <label style="display:block;margin-bottom:4px;font-size:12px;color:#aaa;">Limite de Matches (p/ time)</label>
                    <input id="vlru__scr_limit" type="number" value="20" min="1" max="200" style="width:100%;padding:8px;background:#1a1a1a;border:1px solid #444;border-radius:6px;color:#fff;box-sizing:border-box;"/>
                </div>
                <div style="display:flex; gap:10px;">
                    <button id="vlru__scr_run"   style="flex:2;padding:12px;background:#ff4655;border:none;border-radius:6px;color:white;font-weight:bold;cursor:pointer;">🚀 Iniciar</button>
                    <button id="vlru__scr_clear" style="flex:1;padding:12px;background:#444;border:none;border-radius:6px;color:#ccc;font-weight:bold;cursor:pointer;" title="Limpar Tudo">🗑️ Limpar</button>
                </div>
                <div id="vlru__scr_progress" style="margin-top:12px;display:none;color:#aaa;text-align:center;"></div>
                <div id="vlru__scr_results"  style="margin-top:16px;"></div>
            `;

            const teamInput = document.getElementById("vlru__scr_team");
            const event1Input = document.getElementById("vlru__scr_event1");
            const team2Input = document.getElementById("vlru__scr_team2");
            const event2Input = document.getElementById("vlru__scr_event2");
            const fromInput = document.getElementById("vlru__scr_from");
            const toInput = document.getElementById("vlru__scr_to");
            const limitInput = document.getElementById("vlru__scr_limit");
            const resultsContainer = document.getElementById("vlru__scr_results");
            const runBtn = document.getElementById("vlru__scr_run");
            const clearBtn = document.getElementById("vlru__scr_clear");
            const progress = document.getElementById("vlru__scr_progress");

            // Restaura inputs (valores do usuário — seguros para value, não innerHTML)
            if (savedConfig.team) teamInput.value = savedConfig.team;
            if (savedConfig.event1) event1Input.value = savedConfig.event1;
            if (savedConfig.team2) team2Input.value = savedConfig.team2;
            if (savedConfig.event2) event2Input.value = savedConfig.event2;
            if (savedConfig.from) fromInput.value = savedConfig.from;
            if (savedConfig.to) toInput.value = savedConfig.to;
            if (savedConfig.limit) limitInput.value = savedConfig.limit;

            // [VUL-02] Restaura resultados do storage isolado
            if (savedResults.length > 0) {
                renderAllResults(resultsContainer, savedResults);
            }

            // Persiste inputs ao digitar
            const allInputs = [teamInput, event1Input, team2Input, event2Input, fromInput, toInput, limitInput];
            allInputs.forEach(input => {
                if (input) {
                    input.addEventListener("input", () => {
                        saveState({
                            team: teamInput.value, event1: event1Input.value,
                            team2: team2Input.value, event2: event2Input.value,
                            from: fromInput.value, to: toInput.value, limit: limitInput.value
                        });
                    });
                }
            });

            clearBtn.onclick = () => {
                teamInput.value = ""; event1Input.value = ""; team2Input.value = "";
                event2Input.value = ""; fromInput.value = ""; toInput.value = "";
                limitInput.value = "20";
                resultsContainer.innerHTML = "";
                progress.style.display = "none";
                saveState({ team: "", event1: "", team2: "", event2: "", from: "", to: "", limit: 20 });
                saveResults([]);
            };

            runBtn.onclick = async () => {
                const team1Url = teamInput.value.trim();
                const event1Url = event1Input.value.trim();
                const team2Url = team2Input.value.trim();
                const event2Url = event2Input.value.trim();
                const from = fromInput.value;
                const to = toInput.value;
                // [REM-04] Garante mínimo de 1 e máximo de 200
                const limit = Math.max(1, Math.min(parseInt(limitInput.value) || 20, 200));

                if (!team1Url) { alert("A URL do Time 1 é obrigatória!"); return; }

                runBtn.disabled = true;
                runBtn.textContent = "⏳ Processando...";
                progress.style.display = "block";
                resultsContainer.innerHTML = "";

                const resultsArray = [];
                try {
                    // [VUL-01] textContent para mensagens de progresso
                    progress.textContent = "Iniciando Time 1...";
                    const result1 = await analyzeMatches({
                        teamUrl: team1Url, eventFilterUrl: event1Url,
                        fromDate: from ? new Date(from) : null,
                        toDate: to ? new Date(to) : null,
                        maxMatches: limit
                    }, "Time 1");
                    resultsArray.push(result1);

                    if (team2Url) {
                        progress.textContent = "Iniciando Time 2...";
                        await sleep(1000);
                        const result2 = await analyzeMatches({
                            teamUrl: team2Url, eventFilterUrl: event2Url,
                            fromDate: from ? new Date(from) : null,
                            toDate: to ? new Date(to) : null,
                            maxMatches: limit
                        }, "Time 2");
                        resultsArray.push(result2);
                    }

                    saveResults(resultsArray);
                    renderAllResults(resultsContainer, resultsArray);
                } catch (err) {
                    // [VUL-01] escapeHtml na mensagem de erro (pode conter URL com caracteres especiais)
                    const errDiv = document.createElement("div");
                    errDiv.style.cssText = "color:#ff4655; margin-bottom:10px;";
                    errDiv.textContent = `Erro: ${err.message}`;
                    resultsContainer.appendChild(errDiv);
                } finally {
                    runBtn.disabled = false;
                    runBtn.textContent = "🚀 Iniciar";
                    progress.style.display = "none";
                }
            };
        }

        function renderAllResults(container, resultsArray) {
            container.innerHTML = "";
            resultsArray.forEach((result, index) => {
                const div = document.createElement("div");
                if (index > 0) {
                    div.style.marginTop = "25px";
                    div.style.borderTop = "1px dashed #444";
                    div.style.paddingTop = "15px";
                }
                // [VUL-01/02] generateResultHTML usa escapeHtml/safeNum em todos os campos externos
                div.innerHTML = generateResultHTML(result);
                container.appendChild(div);
            });
        }

        function generateResultHTML(result) {
            // [VUL-01/02] Todos os campos externos escapados. safeNum() em campos numéricos.
            const teamName = escapeHtml(result.teamName);
            const filterEvent = result.filterEvent ? escapeHtml(result.filterEvent) : null;
            const matches = safeNum(result.teamStats && result.teamStats.matches);

            let html = `
              <div style="background:#222;padding:10px;border-radius:6px;margin-bottom:10px;">
                <h3 style="margin:0;color:#ff4655;">${teamName}</h3>
                <small style="color:#aaa;">Jogos: ${safeNum(matches)}</small>
            `;
            if (filterEvent) {
                html += `<div style="font-size:11px;color:#f0f;margin-top:2px;">Filtro: ${filterEvent}</div>`;
            }
            html += `</div>
              <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                  <tr style="background:#333;color:#aaa;">
                    <th style="padding:5px;text-align:left;">Mapa</th>
                    <th style="padding:5px;color:#4caf50;">Picks</th>
                    <th style="padding:5px;color:#ff4655;">Bans</th>
                    <th style="padding:5px;color:#2196f3;">Ban%</th>
                  </tr>
                </thead>
                <tbody>
            `;

            const aggregatedByMap = result.aggregatedByMap || {};
            const sortedMaps = Object.entries(aggregatedByMap).sort((a, b) => b[1].ban - a[1].ban);

            for (const [map, stats] of sortedMaps) {
                // [VUL-01] map: escapeHtml. stats.pick/ban: safeNum. rate: calculado localmente.
                const safePick = safeNum(stats.pick);
                const safeBan = safeNum(stats.ban);
                const rate = matches > 0 ? ((safeBan / matches) * 100).toFixed(1) : "0.0";
                html += `
                <tr style="border-bottom:1px solid #333;">
                  <td style="padding:5px;">${escapeHtml(map)}</td>
                  <td style="padding:5px;text-align:center;color:#4caf50;">${safeNum(safePick)}</td>
                  <td style="padding:5px;text-align:center;color:#ff4655;">${safeNum(safeBan)}</td>
                  <td style="padding:5px;text-align:center;color:#2196f3;">${escapeHtml(rate)}%</td>
                </tr>`;
            }
            html += `</tbody></table>`;
            return html;
        }

        // [VUL-14] Verifica root antes de renderizar, sem setTimeout cego
        if (rootElement) {
            initUI();
        }

    })(roots.root1);

    // =========================================================================
    // SCRIPT 2: Stats Extractor
    // =========================================================================
    (function (rootElement) {
        console.log(">> Iniciando Módulo: Stats Extractor");

        const STORAGE_KEY = "vlru_stats_state";

        // [VUL-02/05] Storage isolado
        function loadFormState() {
            return SecureStorage.get(STORAGE_KEY, {});
        }
        function saveFormState(partial) {
            const prev = loadFormState();
            SecureStorage.set(STORAGE_KEY, { ...prev, ...partial });
        }
        function loadLastResult() {
            try {
                const raw = GM_getValue("vlru_stats_result", null);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                // [VUL-05] Valida schema mínimo esperado antes de usar
                if (typeof parsed !== "object" || parsed === null) return null;
                if (!Array.isArray(parsed.data)) return null;
                // [REM-01] Mesmo fix do SecureStorage.get: usa hasOwnProperty em vez de `in`
                const hop = Object.prototype.hasOwnProperty;
                if (hop.call(parsed, "__proto__") || hop.call(parsed, "constructor") || hop.call(parsed, "prototype")) return null;
                return parsed;
            } catch { return null; }
        }
        function saveLastResult(res) {
            try { GM_setValue("vlru_stats_result", JSON.stringify(res)); } catch (e) { console.error(e); }
        }

        async function fetchPage(url) {
            // [VUL-16] assertVlrUrl via fetchWithTimeout
            try {
                const res = await fetchWithTimeout(url);
                if (!res.ok) throw new Error(`Erro HTTP: ${res.status}`);
                const text = await res.text();
                return new DOMParser().parseFromString(text, "text/html");
            } catch (err) {
                throw new Error("Falha ao acessar a URL: " + err.message);
            }
        }

        function hslToHex(h, s, l) {
            l /= 100;
            const a = s * Math.min(l, 1 - l) / 100;
            const f = n => {
                const k = (n + h / 30) % 12;
                const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
                return Math.round(255 * color).toString(16).padStart(2, "0");
            };
            return `#${f(0)}${f(8)}${f(4)}`;
        }

        function getHexColorForWinRate(winRateStr) {
            const value = parseFloat(String(winRateStr).replace("%", ""));
            if (isNaN(value)) return "#aaaaaa";
            const hue = Math.max(0, Math.min(120, value * 1.2));
            // [VUL-03] safeHexColor valida o resultado antes de usar em style=""
            return safeHexColor(hslToHex(hue, 85, 45));
        }

        function extractStatsFromPage(doc) {
            const teamHeader = doc.querySelector("h1.wf-title") || doc.querySelector(".team-header-name h2");
            const teamName = teamHeader ? teamHeader.innerText.trim() : "Time";

            const tables = doc.querySelectorAll("table.wf-table");
            let table = null;
            for (const t of tables) {
                if (t.innerText.toLowerCase().includes("map")) { table = t; break; }
            }
            if (!table) table = tables[0];
            if (!table) throw new Error("Tabela não encontrada.");

            const headers = Array.from(table.querySelectorAll("thead tr th")).map(th => th.innerText.toLowerCase().trim());

            const findCol = (includesArr, excludesArr = []) => {
                return headers.findIndex(h =>
                    includesArr.every(i => h.includes(i)) &&
                    !excludesArr.some(e => h.includes(e))
                );
            };

            const idxMap = 0;
            const idxWin = findCol(["w"], ["win", "%"]);
            const idxLose = findCol(["l"]);
            const idxWinP = headers.findIndex(h => (h.includes("%") || h.includes("win")) && !h.includes("atk") && !h.includes("def"));
            const idxAtkRWin = findCol(["atk"], ["1st"]);
            const idxDefRWin = findCol(["def"], ["1st"]);
            const idxAtk1st = findCol(["atk", "1st"]);
            const idxDef1st = findCol(["def", "1st"]);

            const rows = Array.from(table.querySelectorAll("tbody tr"));
            const data = [];

            rows.forEach(row => {
                const cells = row.querySelectorAll("td");
                if (cells.length < 3) return;
                let rawMapText = cells[idxMap].innerText.trim();
                let mapName = rawMapText;
                let playedCount = "-";
                const splitMatch = rawMapText.match(/^(.*?)\s*\((\d+)\)$/);
                if (splitMatch) {
                    mapName = splitMatch[1].trim();
                    playedCount = splitMatch[2].trim();
                } else {
                    mapName = rawMapText.split("\n")[0].trim();
                    if (cells[1] && !isNaN(parseInt(cells[1].innerText))) {
                        playedCount = cells[1].innerText.trim();
                    }
                }
                if (!mapName || mapName.toLowerCase() === "all maps") return;

                const getTxt = (idx) => {
                    if (idx === -1 || !cells[idx]) return "-";
                    return cells[idx].innerText.trim().split("(")[0].trim();
                };

                data.push({
                    map: mapName, played: playedCount, winRate: getTxt(idxWinP),
                    win: getTxt(idxWin), lose: getTxt(idxLose),
                    atkRWin: getTxt(idxAtkRWin), defRWin: getTxt(idxDefRWin),
                    atk1st: getTxt(idxAtk1st), def1st: getTxt(idxDef1st)
                });
            });

            return { teamName, data };
        }

        async function processUrl(url) {
            if (!url.includes("/stats/")) throw new Error("Use URL da aba 'Stats'.");
            // [VUL-16] fetchPage já usa fetchWithTimeout que chama assertVlrUrl
            const doc = await fetchPage(url);
            return extractStatsFromPage(doc);
        }

        // [VUL-14] Verificação explícita do root
        function initUI() {
            if (!rootElement) return;

            rootElement.innerHTML = `
                <div>
                   <label style="font-size:11px;text-transform:uppercase;color:#666;font-weight:700;letter-spacing:0.5px;">URL Stats Filtrada</label>
                   <input id="vlru__inp-url" type="text" placeholder="https://www.vlr.gg/team/stats/..." style="width:100%;padding:10px;background:#0a0a0a;border:1px solid #333;color:#fff;border-radius:6px;margin-top:5px;font-size:13px;box-sizing:border-box;">
                </div>
                <div style="display:flex; gap:10px; margin-top:12px;">
                    <button id="vlru__btn-go"    style="flex:3;padding:12px;background:#ff4655;color:white;border:none;border-radius:6px;font-weight:700;cursor:pointer;">EXTRAIR DADOS</button>
                    <button id="vlru__btn-clear" style="flex:1;padding:12px;background:#444;color:#ccc;border:none;border-radius:6px;font-weight:bold;cursor:pointer;">🗑️</button>
                </div>
                <div id="vlru__out-res" style="margin-top:15px;"></div>
            `;

            const saved = loadFormState();
            const inp = document.getElementById("vlru__inp-url");
            const btn = document.getElementById("vlru__btn-go");
            const btnClear = document.getElementById("vlru__btn-clear");
            const out = document.getElementById("vlru__out-res");

            if (saved.url) inp.value = saved.url;

            // [VUL-02] Restaura resultado do storage isolado
            const lastResult = loadLastResult();
            if (lastResult && lastResult.data) render(out, lastResult);

            btnClear.onclick = () => {
                inp.value = "";
                out.innerHTML = "";
                saveFormState({ url: "" });
                GM_setValue("vlru_stats_result", "");
            };

            btn.onclick = async () => {
                const url = inp.value.trim();
                if (!url) return alert("Cole a URL!");
                saveFormState({ url });

                btn.disabled = true;
                btn.textContent = "Processando...";
                out.innerHTML = "<div style='text-align:center;padding:20px;color:#666;'>Carregando...</div>";

                try {
                    const res = await processUrl(url);
                    saveLastResult(res);
                    render(out, res);
                } catch (e) {
                    // [VUL-01] textContent para mensagem de erro
                    out.textContent = `Erro: ${e.message}`;
                    out.style.color = "#ff5555";
                } finally {
                    btn.disabled = false;
                    btn.textContent = "EXTRAIR DADOS";
                }
            };
        }

        function render(container, { teamName, data }) {
            if (!data || !data.length) { container.textContent = "Sem dados."; return; }

            data.sort((a, b) => {
                const valA = parseInt(a.played) || 0;
                const valB = parseInt(b.played) || 0;
                if (valB !== valA) return valB - valA;
                return a.map.localeCompare(b.map);
            });

            // [VUL-01] teamName escapado
            let h = `
            <div style="margin-bottom:15px;color:#fff;font-weight:bold;">${escapeHtml(teamName)}</div>
            <div style="background:#121212; padding:10px; border-radius:5px; overflow-x:auto;">
                <table id="vlru__export-table" border="1" style="width:100%; border-collapse:collapse; font-family:Arial, sans-serif; font-size:12px; text-align:center; color:#eeeeee; border-color:#444;">
                  <thead>
                    <tr style="background-color:#222222; color:#aaaaaa; font-weight:bold;">
                        <th style="padding:8px; border:1px solid #444;">Map</th>
                        <th style="padding:8px; border:1px solid #444;">#</th>
                        <th style="padding:8px; border:1px solid #444;">WIN%</th>
                        <th style="padding:8px; color:#4caf50; border:1px solid #444;">W</th>
                        <th style="padding:8px; color:#f44336; border:1px solid #444;">L</th>
                        <th style="padding:8px; border:1px solid #444;">ATK 1st</th>
                        <th style="padding:8px; border:1px solid #444;">DEF 1st</th>
                        <th style="padding:8px; border:1px solid #444;">ATK RWIN%</th>
                        <th style="padding:8px; border:1px solid #444;">DEF RWIN%</th>
                    </tr>
                  </thead>
                  <tbody>`;

            data.forEach((r, i) => {
                const bg = i % 2 === 0 ? "#1a1a1a" : "#121212";
                // [VUL-03] safeHexColor valida a cor antes de usar em background-color
                const winColorHex = safeHexColor(getHexColorForWinRate(r.winRate));
                // [VUL-01] Todos os campos de células são escapados
                h += `
                <tr style="background-color:${bg};">
                  <td style="padding:8px; text-align:left; font-weight:bold; border:1px solid #444;">${escapeHtml(r.map)}</td>
                  <td style="padding:8px; color:#cccccc; border:1px solid #444;">${escapeHtml(r.played)}</td>
                  <td style="padding:8px; font-weight:bold; color:#ffffff; background-color:${winColorHex}; border:1px solid #444;">${escapeHtml(r.winRate)}</td>
                  <td style="padding:8px; border:1px solid #444;">${escapeHtml(r.win)}</td>
                  <td style="padding:8px; border:1px solid #444;">${escapeHtml(r.lose)}</td>
                  <td style="padding:8px; color:#bbb; border:1px solid #444;">${escapeHtml(r.atk1st)}</td>
                  <td style="padding:8px; color:#bbb; border:1px solid #444;">${escapeHtml(r.def1st)}</td>
                  <td style="padding:8px; color:#bbb; border:1px solid #444;">${escapeHtml(r.atkRWin)}</td>
                  <td style="padding:8px; color:#bbb; border:1px solid #444;">${escapeHtml(r.defRWin)}</td>
                </tr>`;
            });

            h += `</tbody></table></div>`;
            h += `<button id="vlru__cp-rich" style="width:100%; margin-top:15px; padding:12px; background:#fff; border:none; color:#000; cursor:pointer; border-radius:4px; font-weight:bold;">📋 COPIAR TABELA</button>`;

            container.innerHTML = h;

            const cpBtn = document.getElementById("vlru__cp-rich");
            cpBtn.onclick = async () => {
                const tableEl = document.getElementById("vlru__export-table");
                const blob = new Blob([tableEl.outerHTML], { type: "text/html" });
                const item = new ClipboardItem({ "text/html": blob });
                await navigator.clipboard.write([item]);
                const old = cpBtn.textContent;
                cpBtn.textContent = "✅ Copiado com Formatação!";
                cpBtn.style.background = "#4caf50";
                cpBtn.style.color = "#fff";
                setTimeout(() => {
                    cpBtn.textContent = old;
                    cpBtn.style.background = "#fff";
                    cpBtn.style.color = "#000";
                }, 2000);
            };
        }

        if (rootElement) initUI();

    })(roots.root2);

    // =========================================================================
    // SCRIPT 3: Scraper de Pistols (Omniscient)
    // =========================================================================
    (function (rootElement) {
        console.log(">> Iniciando Módulo: PISTOLS");

        const STORAGE_KEY = "vlru_pistols_state";
        const STORAGE_RESULTS_KEY = "vlru_pistols_results";

        const KNOWN_MAPS = [
            "Corrode", "Abyss", "Sunset", "Lotus", "Pearl", "Fracture",
            "Breeze", "Icebox", "Ascent", "Split", "Haven", "Bind"
        ];

        // [VUL-02/05] Storage isolado
        function saveState(data) {
            SecureStorage.set(STORAGE_KEY, data);
        }
        function loadState() {
            return SecureStorage.get(STORAGE_KEY, {});
        }
        function saveResults(arr) {
            SecureStorage.setArray(STORAGE_RESULTS_KEY, arr);
        }
        function loadResults() {
            return SecureStorage.getArray(STORAGE_RESULTS_KEY);
        }

        function parsePistolFromTable(table, filterTeamName) {
            if (!table) return null;
            const rows = table.querySelectorAll("tbody tr");
            let targetWon = 0, enemyWon = 0, foundTarget = false;

            for (const row of rows) {
                if (row.querySelector("th")) continue;
                const teamDiv = row.querySelector(".team");
                if (!teamDiv) continue;
                const teamName = teamDiv.textContent.trim();

                const cols = row.querySelectorAll("td");
                if (cols.length < 2) continue;

                const pistolValDiv = cols[1].querySelector(".stats-sq");
                if (!pistolValDiv) continue;

                const val = parseInt(pistolValDiv.textContent.trim().split(/\s+/)[0], 10) || 0;

                if (teamMatches(teamName, filterTeamName)) {
                    targetWon += val; foundTarget = true;
                } else {
                    enemyWon += val;
                }
            }

            if (!foundTarget && targetWon === 0 && enemyWon === 0) return null;
            return { won: targetWon, lost: enemyWon, total: targetWon + enemyWon };
        }

        function createGlobalIdMap(doc) {
            const mapDict = {};
            doc.querySelectorAll("[data-game-id]").forEach(el => {
                const id = el.getAttribute("data-game-id");
                if (!id || id === "all") return;
                if (mapDict[id]) return;
                // [REM-06] textContent é suficiente e evita leitura desnecessária de innerHTML da página host
                const content = el.textContent.toLowerCase();
                for (const map of KNOWN_MAPS) {
                    if (content.includes(map.toLowerCase())) {
                        mapDict[id] = map;
                        break;
                    }
                }
            });
            return mapDict;
        }

        function getVetoSequence(doc) {
            const vetoText = (doc.querySelector(".match-veto")?.textContent || "") +
                (doc.querySelector(".match-header-note")?.textContent || "");
            const foundMaps = [];
            for (const seg of vetoText.toLowerCase().split(/[;\n]/)) {
                if (seg.includes("ban")) continue;
                for (const map of KNOWN_MAPS) {
                    if (seg.includes(map.toLowerCase())) {
                        if (foundMaps[foundMaps.length - 1] !== map) foundMaps.push(map);
                        break;
                    }
                }
            }
            return foundMaps;
        }

        function extractAllPistolsWithMapNames(doc, filterTeamName) {
            const gameDivs = Array.from(doc.querySelectorAll(".vm-stats-container .vm-stats-game"));
            const globalIdMap = createGlobalIdMap(doc);
            const vetoSeq = getVetoSequence(doc);
            const results = [];
            let mapCounter = 0;

            for (const div of gameDivs) {
                const gameId = div.getAttribute("data-game-id");
                if (!gameId || gameId === "all") continue;

                let mapName = globalIdMap[gameId];
                if (!mapName && vetoSeq.length > mapCounter) mapName = vetoSeq[mapCounter];
                // [VUL-01] Garante que o fallback seja numérico puro (apenas dígitos do gameId)
                if (!mapName) mapName = `Mapa ${safeNum(gameId)}`;
                mapCounter++;

                const econTable = div.querySelector("table.wf-table-inset.mod-econ");
                if (!econTable) continue;

                const mapStats = parsePistolFromTable(econTable, filterTeamName);
                if (mapStats) results.push({ map: mapName, stats: mapStats });
            }
            return results;
        }

        async function analyzeMatches(options = {}, progressPrefix = "") {
            const { teamUrl, eventFilterUrl, fromDate, toDate, maxMatches = 100 } = options;
            if (!teamUrl) throw new Error("❌ URL do time é obrigatória!");

            const eventFilterPath = eventFilterUrl ? extractEventPath(eventFilterUrl) : null;
            const teamDoc = await fetchDoc(teamUrl);
            const teamName = extractTeamNameFromPage(teamDoc);
            if (!teamName) throw new Error("❌ Não foi possível extrair o nome do time");

            const matchesUrl = await navigateToMatchesTab(teamUrl);
            const matchList = await fetchAllMatchesPages(matchesUrl, maxMatches);
            if (matchList.length === 0) throw new Error("❌ Nenhum match encontrado");

            let filteredByDate = matchList;
            if (fromDate || toDate) {
                filteredByDate = matchList.filter((m) => {
                    if (!m.date) return true;
                    if (fromDate && m.date < fromDate) return false;
                    if (toDate && m.date > toDate) return false;
                    return true;
                });
            }

            const toProcess = filteredByDate.slice(0, maxMatches);
            const summary = { pistolsWon: 0, pistolsLost: 0, pistolsTotal: 0, matchesAnalyzed: 0, mapsAnalyzed: 0 };
            const mapAggregator = {};
            const filteredOut = { event: 0, noData: 0 };

            // [VUL-12] ID com prefixo único
            const progressEl = rootElement.querySelector("#vlru__pst_progress");

            for (let i = 0; i < toProcess.length; i++) {
                const matchInfo = toProcess[i];
                if (progressEl) {
                    const prefix = progressPrefix ? `[${progressPrefix}] ` : "";
                    // [VUL-01] textContent para progresso
                    progressEl.textContent = `${prefix}Analisando match ${i + 1} de ${toProcess.length}...`;
                }
                try {
                    const matchDoc = await fetchDoc(matchInfo.url);
                    if (eventFilterPath && !checkEventFilter(matchDoc, eventFilterPath)) {
                        filteredOut.event++;
                        continue;
                    }
                    const ecoUrl = matchInfo.url.includes("?")
                        ? matchInfo.url + "&tab=economy"
                        : matchInfo.url + "/?tab=economy";
                    const ecoDoc = await fetchDoc(ecoUrl);
                    const mapsData = extractAllPistolsWithMapNames(ecoDoc, teamName);

                    if (!mapsData || mapsData.length === 0) { filteredOut.noData++; continue; }

                    summary.matchesAnalyzed++;
                    for (const item of mapsData) {
                        const { map, stats } = item;
                        summary.pistolsWon += stats.won;
                        summary.pistolsLost += stats.lost;
                        summary.pistolsTotal += stats.total;
                        summary.mapsAnalyzed++;
                        const mapKey = Object.keys(mapAggregator).find(k => k.toLowerCase() === map.toLowerCase()) || map;
                        if (!mapAggregator[mapKey]) mapAggregator[mapKey] = { won: 0, total: 0, played: 0 };
                        mapAggregator[mapKey].won += stats.won;
                        mapAggregator[mapKey].total += stats.total;
                        mapAggregator[mapKey].played++;
                    }
                    await sleep(400);
                } catch (err) {
                    console.warn(`Erro: ${err.message}`);
                }
            }
            return { teamName, summary, mapAggregator, filteredOut, filterEvent: eventFilterPath };
        }

        // [VUL-14] Verificação explícita do root
        function initUI() {
            if (!rootElement) return;

            rootElement.innerHTML = `
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;color:#aaa;">URL do Time 1 <span style="color:#00bcd4;">*</span></label>
                    <input id="vlru__pst_team"  placeholder="Ex: https://www.vlr.gg/team/..." style="width:100%;padding:8px;background:#0a0a0a;border:1px solid #444;border-radius:4px;color:#fff;box-sizing:border-box;"/>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;color:#aaa;">URL do Evento (Opcional)</label>
                    <input id="vlru__pst_event1" placeholder="Filtrar por evento..." style="width:100%;padding:8px;background:#0a0a0a;border:1px solid #444;border-radius:4px;color:#fff;box-sizing:border-box;"/>
                </div>
                <hr style="border:0;border-top:1px dashed #444;margin:12px 0;">
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;color:#aaa;">URL do Time 2 (Opcional)</label>
                    <input id="vlru__pst_team2" placeholder="Ex: https://www.vlr.gg/team/..." style="width:100%;padding:8px;background:#0a0a0a;border:1px solid #444;border-radius:4px;color:#fff;box-sizing:border-box;"/>
                </div>
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;color:#aaa;">URL do Evento T2 (Opcional)</label>
                    <input id="vlru__pst_event2" placeholder="Filtrar Time 2 por evento..." style="width:100%;padding:8px;background:#0a0a0a;border:1px solid #444;border-radius:4px;color:#fff;box-sizing:border-box;"/>
                </div>
                <hr style="border:0;border-top:1px dashed #444;margin:12px 0;">
                <div style="display:flex;gap:8px;margin-bottom:12px;">
                    <div style="flex:1;">
                        <label style="color:#aaa;">De</label>
                        <input id="vlru__pst_from" type="date" style="width:100%;padding:6px;background:#0a0a0a;border:1px solid #444;border-radius:4px;color:#fff;box-sizing:border-box;"/>
                    </div>
                    <div style="flex:1;">
                        <label style="color:#aaa;">Até</label>
                        <input id="vlru__pst_to" type="date" style="width:100%;padding:6px;background:#0a0a0a;border:1px solid #444;border-radius:4px;color:#fff;box-sizing:border-box;"/>
                    </div>
                </div>
                <div style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:4px;color:#aaa;">Limite de Matches</label>
                    <input id="vlru__pst_limit" type="number" value="20" min="1" max="200" style="width:100%;padding:6px;background:#0a0a0a;border:1px solid #444;border-radius:4px;color:#fff;box-sizing:border-box;"/>
                </div>
                <div style="display:flex; gap:10px;">
                    <button id="vlru__pst_run"   style="flex:2;padding:10px;background:#00bcd4;border:none;border-radius:4px;color:white;font-weight:bold;cursor:pointer;">🚀 Iniciar</button>
                    <button id="vlru__pst_clear" style="flex:1;padding:10px;background:#333;border:none;border-radius:4px;color:#ccc;cursor:pointer;">Limpar</button>
                </div>
                <div id="vlru__pst_progress" style="margin-top:10px;display:none;color:#00bcd4;text-align:center;font-size:12px;"></div>
                <div id="vlru__pst_results"  style="margin-top:15px;"></div>
            `;

            const inputIds = ["vlru__pst_team", "vlru__pst_event1", "vlru__pst_team2", "vlru__pst_event2", "vlru__pst_from", "vlru__pst_to", "vlru__pst_limit"];
            const els = {};
            inputIds.forEach(id => els[id] = rootElement.querySelector(`#${id}`));

            const resDiv = rootElement.querySelector("#vlru__pst_results");
            const progress = rootElement.querySelector("#vlru__pst_progress");
            const runBtn = rootElement.querySelector("#vlru__pst_run");
            const clearBtn = rootElement.querySelector("#vlru__pst_clear");

            const saved = loadState();
            const savedResults = loadResults();

            if (saved.team) els["vlru__pst_team"].value = saved.team;
            if (saved.event1) els["vlru__pst_event1"].value = saved.event1;
            if (saved.team2) els["vlru__pst_team2"].value = saved.team2;
            if (saved.event2) els["vlru__pst_event2"].value = saved.event2;
            if (saved.from) els["vlru__pst_from"].value = saved.from;
            if (saved.to) els["vlru__pst_to"].value = saved.to;
            if (saved.limit) els["vlru__pst_limit"].value = saved.limit;

            // [VUL-02] Restaura resultados do storage isolado via generateResultHTML seguro
            if (savedResults.length > 0) {
                resDiv.innerHTML = savedResults.map(generateResultHTML).join('<div style="margin:15px 0;border-top:1px dashed #444;"></div>');
            }

            // Persiste inputs
            inputIds.forEach(id => {
                els[id].addEventListener("input", () => {
                    saveState({
                        team: els["vlru__pst_team"].value,
                        event1: els["vlru__pst_event1"].value,
                        team2: els["vlru__pst_team2"].value,
                        event2: els["vlru__pst_event2"].value,
                        from: els["vlru__pst_from"].value,
                        to: els["vlru__pst_to"].value,
                        limit: els["vlru__pst_limit"].value
                    });
                });
            });

            clearBtn.onclick = () => {
                inputIds.forEach(id => els[id].value = id === "vlru__pst_limit" ? "20" : "");
                resDiv.innerHTML = "";
                saveState({ team: "", event1: "", team2: "", event2: "", from: "", to: "", limit: 20 });
                saveResults([]);
            };

            runBtn.onclick = async () => {
                const team1Url = els["vlru__pst_team"].value.trim();
                const team2Url = els["vlru__pst_team2"].value.trim();
                if (!team1Url) return alert("URL do Time 1 é obrigatória!");

                runBtn.disabled = true;
                runBtn.textContent = "⏳ ...";
                progress.style.display = "block";
                resDiv.innerHTML = "";

                // [REM-04] Garante mínimo de 1 e máximo de 200
                const limit = Math.max(1, Math.min(parseInt(els["vlru__pst_limit"].value) || 20, 200));
                const from = els["vlru__pst_from"].value ? new Date(els["vlru__pst_from"].value) : null;
                const to = els["vlru__pst_to"].value ? new Date(els["vlru__pst_to"].value) : null;

                const results = [];
                try {
                    progress.textContent = "Analisando Time 1...";
                    const r1 = await analyzeMatches({
                        teamUrl: team1Url, eventFilterUrl: els["vlru__pst_event1"].value.trim(),
                        fromDate: from, toDate: to, maxMatches: limit
                    }, "T1");
                    results.push(r1);

                    if (team2Url) {
                        progress.textContent = "Analisando Time 2...";
                        await sleep(1000);
                        const r2 = await analyzeMatches({
                            teamUrl: team2Url, eventFilterUrl: els["vlru__pst_event2"].value.trim(),
                            fromDate: from, toDate: to, maxMatches: limit
                        }, "T2");
                        results.push(r2);
                    }

                    saveResults(results);
                    resDiv.innerHTML = results.map(generateResultHTML).join('<div style="margin:15px 0;border-top:1px dashed #444;"></div>');
                } catch (e) {
                    // [VUL-01] textContent para erros
                    resDiv.textContent = `Erro: ${e.message}`;
                    resDiv.style.color = "red";
                } finally {
                    runBtn.disabled = false;
                    runBtn.textContent = "🚀 Iniciar";
                    progress.style.display = "none";
                }
            };
        }

        function generateResultHTML(result) {
            // [VUL-01/02] Todos os campos externos escapados. safeNum() em campos numéricos.
            const teamName = escapeHtml(result.teamName);
            const filterEvent = result.filterEvent ? escapeHtml(result.filterEvent) : null;
            const summary = result.summary || {};
            const totalWon = safeNum(summary.pistolsWon);
            const totalAll = safeNum(summary.pistolsTotal);
            const totalWinRate = totalAll > 0 ? ((totalWon / totalAll) * 100).toFixed(1) : "0.0";

            let html = `
              <div style="background:#222;padding:10px;border-radius:4px;margin-bottom:10px;border-left:3px solid #00bcd4;">
                <h3 style="margin:0;font-size:14px;">${teamName}</h3>
                <small style="color:#aaa;">Geral: ${safeNum(summary.matchesAnalyzed)} Jogos | ${safeNum(summary.mapsAnalyzed)} Mapas</small>
                ${filterEvent ? `<div style="font-size:11px;color:#f0f;margin-top:2px;">Filtro: ${filterEvent}</div>` : ""}
              </div>
              <div style="margin-bottom:5px;font-weight:bold;color:#00bcd4;font-size:12px;">TOTAL GERAL</div>
              <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:15px;background:#111;border-radius:4px;overflow:hidden;">
                <thead>
                  <tr style="background:#333;color:#ccc;">
                    <th style="padding:8px;text-align:center;">Total</th>
                    <th style="padding:8px;text-align:center;color:#4caf50;">Won</th>
                    <th style="padding:8px;text-align:center;color:#2196f3;">%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="padding:10px;text-align:center;font-weight:bold;">${safeNum(totalAll)}</td>
                    <td style="padding:10px;text-align:center;font-weight:bold;color:#4caf50;">${safeNum(totalWon)}</td>
                    <td style="padding:10px;text-align:center;font-weight:bold;color:#2196f3;">${escapeHtml(totalWinRate)}%</td>
                  </tr>
                </tbody>
              </table>
              <div style="margin-bottom:5px;font-weight:bold;color:#aaa;font-size:12px;">DETALHE POR MAPA</div>
              <table style="width:100%;border-collapse:collapse;font-size:12px;background:#111;border-radius:4px;overflow:hidden;">
                <thead>
                  <tr style="background:#333;color:#ccc;">
                    <th style="padding:6px;text-align:left;">Mapa</th>
                    <th style="padding:6px;text-align:center;">J</th>
                    <th style="padding:6px;text-align:center;color:#4caf50;">W</th>
                    <th style="padding:6px;text-align:center;color:#2196f3;">%</th>
                  </tr>
                </thead>
                <tbody>`;

            const mapAggregator = result.mapAggregator || {};
            const sortedMaps = Object.entries(mapAggregator).sort((a, b) => b[1].total - a[1].total);

            for (const [mapName, stats] of sortedMaps) {
                // [VUL-01] mapName escapado; stats.* forçados a número
                const won = safeNum(stats.won);
                const total = safeNum(stats.total);
                const played = safeNum(stats.played);
                const rate = total > 0 ? ((won / total) * 100).toFixed(0) : "0";
                html += `
                  <tr style="border-bottom:1px solid #222;">
                    <td style="padding:6px;border-right:1px solid #222;">${escapeHtml(mapName)} <span style="color:#555;font-size:10px;">(${safeNum(played)})</span></td>
                    <td style="padding:6px;text-align:center;">${safeNum(total)}</td>
                    <td style="padding:6px;text-align:center;color:#4caf50;">${safeNum(won)}</td>
                    <td style="padding:6px;text-align:center;color:#2196f3;">${escapeHtml(rate)}%</td>
                  </tr>`;
            }

            if (sortedMaps.length === 0) {
                html += `<tr><td colspan="4" style="padding:10px;text-align:center;color:#666;">Sem dados</td></tr>`;
            }

            html += `</tbody></table>`;
            return html;
        }

        if (rootElement) initUI();

    })(roots.root3);

})();