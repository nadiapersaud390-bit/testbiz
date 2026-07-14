/**
 * Agent Stats logic for parsing dialer CSVs and syncing them to Firebase + Leaderboard
 * PRESERVES EXACT CSV ORDER - NO SORTING WHATSOEVER
 * FIXED: Allows momo (admin) to access Agent Stats
 * FIXED: Counts leads based ONLY on duration >= 120 seconds (Status column ignored for counting)
 * FIXED: Auto-detects semicolon (;), comma (,), tab, or pipe delimiters in CSV files
 */

let allReports = [];
let currentReportData = null;
let asSortCol = 'agentName';
let asSortAsc = true;
let asSubscribed = false;

let lastAutoPushedReportId = null;
let previousReportData = null;
let _asLastUploadedDateLabel = null;

function canAccessAgentStats() {
    const currentAdmin = JSON.parse(
        sessionStorage.getItem('currentAdmin') || '{}'
    );

    const email = String(
        currentAdmin.email || ''
    ).toLowerCase();

    if (email === 'rose') return true;
    if (email === 'momo') return true;
    if (email === 'nadia') return true;

    if (currentAdmin.role === 'super_admin') return true;
    if (currentAdmin.isSuper === true) return true;

    return false;
}

function isPhTrainingName(rawName) {
    if (!rawName) return false;

    const text = String(rawName).trim();

    return /^PH(?![A-Za-z])/i.test(text);
}

function normalizeLeadNumber(raw) {
    if (!raw) return '';

    const digits = String(raw).replace(/\D/g, '');

    if (!digits) return '';

    return digits.slice(-10);
}

function normalizeAgentKey(rawName) {
    return String(rawName || '')
        .replace(/^(GYP|GYB|GTM|RM)\s+/i, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function getCountableLeadSet(data) {
    const countable = new Set();

    if (!Array.isArray(data)) {
        return countable;
    }

    const lastRowByNumber = new Map();

    data.forEach(row => {
        const number = normalizeLeadNumber(
            row.leadNumber
        );

        if (number) {
            lastRowByNumber.set(number, row);
        }
    });

    data.forEach(row => {
        const number = normalizeLeadNumber(
            row.leadNumber
        );

        if (!number) {
            countable.add(row);
        } else if (
            lastRowByNumber.get(number) === row
        ) {
            countable.add(row);
        }
    });

    return countable;
}

function isLead(row, countableSet) {
    const duration = Number(
        row.duration
    ) || 0;

    if (duration === 0) {
        return false;
    }

    if (
        countableSet &&
        !countableSet.has(row)
    ) {
        return false;
    }

    return duration >= 120;
}

function detectDelimiter(line) {
    const delimiters = [
        ',',
        ';',
        '\t',
        '|'
    ];

    for (const delimiter of delimiters) {
        const parts = line.split(delimiter);

        if (
            parts.length >= 2 &&
            parts[0].trim().length > 0 &&
            parts[1].trim().length > 0
        ) {
            return delimiter;
        }
    }

    return ',';
}

function parseCSVRow(row, delimiter) {
    const result = [];

    let inQuote = false;
    let current = '';

    for (
        let index = 0;
        index < row.length;
        index++
    ) {
        const character = row[index];

        if (character === '"') {
            inQuote = !inQuote;
        } else if (
            character === delimiter &&
            !inQuote
        ) {
            result.push(current.trim());
            current = '';
        } else {
            current += character;
        }
    }

    result.push(current.trim());

    return result.map(value => {
        return value.replace(
            /^"|"$/g,
            ''
        );
    });
}

function normalizeReportDateLabel(input) {
    if (!input) {
        return 'Unknown Date';
    }

    const raw = String(input).trim();

    let date = null;

    const match = raw.match(
        /^(\d{1,2})[\/\-_](\d{1,2})[\/\-_](\d{2,4})/
    );

    if (match) {
        let year = parseInt(
            match[3],
            10
        );

        if (year < 100) {
            year += 2000;
        }

        date = new Date(
            year,
            parseInt(match[1], 10) - 1,
            parseInt(match[2], 10)
        );
    } else {
        const cleaned = raw
            .replace(
                /\s*\([^)]*\)\s*$/,
                ''
            )
            .trim();

        date = new Date(cleaned);
    }

    if (
        !date ||
        isNaN(date.getTime())
    ) {
        return raw;
    }

    return (
        date.toLocaleDateString(
            'en-US',
            {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }
        ) +
        ' (' +
        date.toLocaleDateString(
            'en-US',
            {
                weekday: 'short'
            }
        ) +
        ')'
    );
}

window.renderAgentStatsHistory = function () {
    const hasAccess =
        canAccessAgentStats();

    if (!hasAccess) {
        const container =
            document.getElementById(
                'ah-sect-stats'
            );

        if (container) {
            container.innerHTML = `
                <div class="p-20 text-center">
                    <i class="fas fa-lock text-5xl text-red-500 mb-4"></i>

                    <p class="text-slate-400 font-bold uppercase tracking-widest">
                        Access Denied
                    </p>

                    <p class="text-slate-500 text-sm mt-2">
                        Agent Stats is only available for Authorized Admins.
                    </p>
                </div>
            `;
        }

        return;
    }

    if (asSubscribed) {
        if (currentReportData) {
            viewReport(
                currentReportData.id
            );
        } else if (
            allReports.length > 0
        ) {
            const sortedForDisplay = [
                ...allReports
            ].sort((a, b) => {
                return (
                    new Date(
                        b.uploadedAt || 0
                    ) -
                    new Date(
                        a.uploadedAt || 0
                    )
                );
            });

            if (
                sortedForDisplay.length > 0
            ) {
                viewReport(
                    sortedForDisplay[0].id
                );
            }
        }
    } else if (
        typeof window.listenForAgentReports ===
        'function'
    ) {
        window.listenForAgentReports(
            data => {
                allReports =
                    Array.isArray(data)
                        ? data
                        : [];

                window.allAgentReports =
                    allReports;

                const now = new Date();

                allReports.forEach(
                    report => {
                        if (
                            !report.expiresAt
                        ) {
                            return;
                        }

                        const expires =
                            new Date(
                                report.expiresAt
                            );

                        if (
                            !isNaN(
                                expires.getTime()
                            ) &&
                            now > expires &&
                            typeof window.deleteAgentReportFromFirebase ===
                                'function'
                        ) {
                            window.deleteAgentReportFromFirebase(
                                report.id
                            );
                        }
                    }
                );

                renderHistoryList();

                const sortedForDisplay = [
                    ...allReports
                ].sort((a, b) => {
                    return (
                        new Date(
                            b.uploadedAt || 0
                        ) -
                        new Date(
                            a.uploadedAt || 0
                        )
                    );
                });

                if (
                    sortedForDisplay.length ===
                    0
                ) {
                    currentReportData = null;
                } else if (
                    _asLastUploadedDateLabel
                ) {
                    const uploadedDateLabel =
                        _asLastUploadedDateLabel;

                    const matchingReports =
                        sortedForDisplay.filter(
                            report => {
                                return (
                                    normalizeReportDateLabel(
                                        report.reportDate
                                    ) ===
                                    uploadedDateLabel
                                );
                            }
                        );

                    _asLastUploadedDateLabel =
                        null;

                    currentReportData =
                        matchingReports[0] ||
                        sortedForDisplay[0];

                    viewReport(
                        currentReportData.id
                    );
                } else if (
                    currentReportData
                ) {
                    const refreshedCurrent =
                        allReports.find(
                            report => {
                                return (
                                    report.id ===
                                    currentReportData.id
                                );
                            }
                        );

                    if (refreshedCurrent) {
                        currentReportData =
                            refreshedCurrent;

                        viewReport(
                            refreshedCurrent.id
                        );
                    } else {
                        const previousDate =
                            normalizeReportDateLabel(
                                currentReportData.reportDate
                            );

                        const replacement =
                            sortedForDisplay.find(
                                report => {
                                    return (
                                        normalizeReportDateLabel(
                                            report.reportDate
                                        ) ===
                                        previousDate
                                    );
                                }
                            );

                        currentReportData =
                            replacement ||
                            sortedForDisplay[0];

                        viewReport(
                            currentReportData.id
                        );
                    }
                } else {
                    currentReportData =
                        sortedForDisplay[0];

                    viewReport(
                        sortedForDisplay[0].id
                    );
                }

                const latestReport =
                    sortedForDisplay[0];

                if (
                    latestReport &&
                    lastAutoPushedReportId !==
                        latestReport.id
                ) {
                    lastAutoPushedReportId =
                        latestReport.id;

                    autoPushReportToDashboard(
                        latestReport
                    );
                }
            }
        );

        asSubscribed = true;
    }

    setupDropZone();

    const searchInput =
        document.getElementById(
            'as-search-input'
        );

    if (
        searchInput &&
        !searchInput.dataset
            .agentStatsBound
    ) {
        searchInput.dataset.agentStatsBound =
            '1';

        searchInput.addEventListener(
            'input',
            () => {
                if (currentReportData) {
                    renderActiveReportTable();
                }
            }
        );
    }
};

async function autoPushReportToDashboard(
    report
) {
    if (
        !report ||
        !Array.isArray(report.data)
    ) {
        return;
    }

    const guyanaNow = new Date(
        new Date().toLocaleString(
            'en-US',
            {
                timeZone:
                    'America/Guyana'
            }
        )
    );

    const todayCanonical =
        guyanaNow.toLocaleDateString(
            'en-US',
            {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            }
        );

    const reportCanonical = String(
        normalizeReportDateLabel(
            report.reportDate
        ) || ''
    )
        .split(' (')[0]
        .trim();

    if (
        !reportCanonical ||
        reportCanonical !==
            todayCanonical
    ) {
        console.log(
            '[Daily Board] Report saved in Agent Stats but not pushed because the report date is not today.',
            {
                reportDate:
                    reportCanonical,

                today:
                    todayCanonical
            }
        );

        return;
    }

    const aggregateMap = {};

    const countableSet =
        getCountableLeadSet(
            report.data
        );

    report.data.forEach(row => {
        const agentKey =
            normalizeAgentKey(
                row.agentName ||
                row.rawName
            );

        if (!agentKey) {
            return;
        }

        if (!aggregateMap[agentKey]) {
            aggregateMap[agentKey] = {
                name:
                    row.agentName ||
                    row.rawName ||
                    agentKey,

                rawName:
                    row.rawName ||
                    row.agentName ||
                    agentKey,

                team:
                    row.team ||
                    (
                        typeof normalizeTeam ===
                        'function'
                            ? normalizeTeam(
                                '',
                                row.rawName ||
                                    row.agentName
                            )
                            : 'PR'
                    ),

                transfers: 0
            };
        }

        if (
            isLead(
                row,
                countableSet
            )
        ) {
            aggregateMap[
                agentKey
            ].transfers += 1;
        }
    });

    const dashboardAgents =
        Object.values(
            aggregateMap
        ).map(agent => {
            return {
                name: agent.name,
                rawName: agent.rawName,
                team: agent.team,
                dailyLeads:
                    agent.transfers
            };
        });

    const pushState = {
        dateLabel:
            reportCanonical,

        pushedAt:
            new Date().toISOString(),

        pushedBy:
            report.author ||
            'Agent Stats Upload',

        sourceReportId:
            report.id || '',

        agents:
            dashboardAgents
    };

    if (
        typeof window.saveLiveDashboardState ===
        'function'
    ) {
        await window.saveLiveDashboardState(
            pushState
        );
    }

    window._asLastLiveState =
        pushState;

    if (
        typeof window.updateDashboard ===
        'function'
    ) {
        setTimeout(() => {
            window.updateDashboard();
        }, 250);
    }

    if (
        typeof window.writeAdminActivityLog ===
        'function'
    ) {
        window.writeAdminActivityLog(
            'auto_push',
            `Auto-pushed Report: ${report.reportDate}`
        );
    }

    console.log(
        '[Daily Board] Updated successfully:',
        pushState
    );
}

function setupDropZone() {
    const dropZone =
        document.getElementById(
            'as-drop-zone'
        );

    const fileInput =
        document.getElementById(
            'as-file-input'
        );

    if (
        !dropZone ||
        !fileInput
    ) {
        return;
    }

    if (
        dropZone.dataset
            .agentStatsDropBound ===
        '1'
    ) {
        return;
    }

    dropZone.dataset
        .agentStatsDropBound = '1';

    dropZone.addEventListener(
        'click',
        () => fileInput.click()
    );

    dropZone.addEventListener(
        'dragover',
        event => {
            event.preventDefault();

            dropZone.classList.add(
                'border-cyan-400',
                'bg-cyan-500/10'
            );
        }
    );

    dropZone.addEventListener(
        'dragleave',
        event => {
            event.preventDefault();

            dropZone.classList.remove(
                'border-cyan-400',
                'bg-cyan-500/10'
            );
        }
    );

    dropZone.addEventListener(
        'drop',
        event => {
            event.preventDefault();

            dropZone.classList.remove(
                'border-cyan-400',
                'bg-cyan-500/10'
            );

            if (
                event.dataTransfer.files
                    .length
            ) {
                handleFileUpload(
                    event.dataTransfer
                        .files[0]
                );
            }
        }
    );

    fileInput.addEventListener(
        'change',
        event => {
            if (
                event.target.files
                    .length
            ) {
                handleFileUpload(
                    event.target.files[0]
                );
            }
        }
    );
}

let _asStagedFile = null;
let _asStagedParsed = null;
let _asStagedDateStr = null;
let _asStagedParsedDate = null;
let _asRetentionDays = 30;

window.asSetRetention =
    function (days) {
        if (
            !days ||
            isNaN(days) ||
            days < 1
        ) {
            return;
        }

        _asRetentionDays = days;

        [
            7,
            30,
            60,
            90
        ].forEach(value => {
            const button =
                document.getElementById(
                    `as-ret-${value}`
                );

            if (button) {
                button.classList.remove(
                    'active-ret'
                );
            }

            if (
                button &&
                value === days
            ) {
                button.classList.add(
                    'active-ret'
                );
            }
        });

        const customInput =
            document.getElementById(
                'as-ret-custom'
            );

        if (
            customInput &&
            days !== 7 &&
            days !== 30 &&
            days !== 60 &&
            days !== 90
        ) {
            customInput.value = days;
        }

        const expiryDate =
            new Date();

        expiryDate.setDate(
            expiryDate.getDate() +
                days
        );

        const expiryElement =
            document.getElementById(
                'as-expiry-display'
            );

        if (expiryElement) {
            expiryElement.innerText =
                expiryDate.toLocaleDateString(
                    'en-US',
                    {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    }
                );
        }
    };

window.asSetCustomRetention =
    function () {
        const customInput =
            document.getElementById(
                'as-ret-custom'
            );

        if (!customInput) {
            return;
        }

        let days = parseInt(
            customInput.value,
            10
        );

        if (
            isNaN(days) ||
            days < 1
        ) {
            days = 30;
        }

        if (days > 365) {
            days = 365;
        }

        _asRetentionDays = days;

        [
            7,
            30,
            60,
            90
        ].forEach(value => {
            const button =
                document.getElementById(
                    `as-ret-${value}`
                );

            if (button) {
                button.classList.remove(
                    'active-ret'
                );
            }
        });

        const expiryDate =
            new Date();

        expiryDate.setDate(
            expiryDate.getDate() +
                days
        );

        const expiryElement =
            document.getElementById(
                'as-expiry-display'
            );

        if (expiryElement) {
            expiryElement.innerText =
                expiryDate.toLocaleDateString(
                    'en-US',
                    {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    }
                );
        }
    };

window.asToggleDateOverride =
    function (checked) {
        const input =
            document.getElementById(
                'as-report-date-input'
            );

        if (!input) {
            return;
        }

        input.readOnly = !checked;

        input.style.borderColor =
            checked
                ? 'rgba(6,182,212,0.5)'
                : '';

        input.style.cursor =
            checked
                ? 'text'
                : 'default';
    };

window.asConfirmUpload =
    async function () {
        if (
            !_asStagedParsed ||
            !_asStagedFile
        ) {
            updateStatsStatus(
                '❌ No file staged. Please re-select your CSV.',
                true
            );

            return;
        }

        const dateInput =
            document.getElementById(
                'as-report-date-input'
            );

        const overrideCheck =
            document.getElementById(
                'as-date-override-check'
            );

        const isOverride =
            Boolean(
                overrideCheck &&
                overrideCheck.checked
            );

        let finalDateStr =
            _asStagedDateStr;

        if (
            isOverride &&
            dateInput &&
            dateInput.value.trim()
        ) {
            finalDateStr =
                dateInput.value.trim();
        }

        const normalizedFinalDate =
            normalizeReportDateLabel(
                finalDateStr
            );

        updateStatsStatus(
            '<i class="fas fa-spinner fa-spin mr-2"></i> Saving fresh report to Firebase...',
            false
        );

        const currentAdmin =
            JSON.parse(
                sessionStorage.getItem(
                    'currentAdmin'
                ) || '{}'
            );

        const adminName =
            currentAdmin.name ||
            currentAdmin.email ||
            'Admin';

        const expiryDate =
            new Date();

        expiryDate.setDate(
            expiryDate.getDate() +
                _asRetentionDays
        );

        const dayName =
            typeof getGuyanaDayName ===
            'function'
                ? getGuyanaDayName(
                    _asStagedParsedDate
                )
                : 'MON';

        const existingReportsForDate =
            allReports.filter(
                report => {
                    return (
                        normalizeReportDateLabel(
                            report.reportDate
                        ) ===
                        normalizedFinalDate
                    );
                }
            );

        const existingReport = [
            ...existingReportsForDate
        ].sort((a, b) => {
            return (
                new Date(
                    b.uploadedAt || 0
                ) -
                new Date(
                    a.uploadedAt || 0
                )
            );
        })[0] || null;

        previousReportData =
            existingReport || null;

        const prevLeadMap = {};

        if (
            existingReport &&
            Array.isArray(
                existingReport.data
            )
        ) {
            const previousCountable =
                getCountableLeadSet(
                    existingReport.data
                );

            existingReport.data.forEach(
                row => {
                    const agentKey =
                        normalizeAgentKey(
                            row.agentName ||
                                row.rawName
                        );

                    if (!agentKey) {
                        return;
                    }

                    if (
                        !Object.prototype
                            .hasOwnProperty
                            .call(
                                prevLeadMap,
                                agentKey
                            )
                    ) {
                        prevLeadMap[
                            agentKey
                        ] = 0;
                    }

                    if (
                        isLead(
                            row,
                            previousCountable
                        )
                    ) {
                        prevLeadMap[
                            agentKey
                        ] += 1;
                    }
                }
            );
        }

        const agentLeadMap = {};
        const agentDisplayNameMap = {};

        const stagedCountable =
            getCountableLeadSet(
                _asStagedParsed
            );

        _asStagedParsed.forEach(
            row => {
                const agentKey =
                    normalizeAgentKey(
                        row.agentName ||
                            row.rawName
                    );

                if (!agentKey) {
                    return;
                }

                if (
                    !Object.prototype
                        .hasOwnProperty
                        .call(
                            agentLeadMap,
                            agentKey
                        )
                ) {
                    agentLeadMap[
                        agentKey
                    ] = 0;
                }

                agentDisplayNameMap[
                    agentKey
                ] =
                    row.agentName ||
                    row.rawName ||
                    agentKey;

                if (
                    isLead(
                        row,
                        stagedCountable
                    )
                ) {
                    agentLeadMap[
                        agentKey
                    ] += 1;
                }
            }
        );

        const totalRows =
            _asStagedParsed.length;

        const totalLeads =
            Object.values(
                agentLeadMap
            ).reduce(
                (total, count) => {
                    return (
                        total +
                        Number(
                            count || 0
                        )
                    );
                },
                0
            );

        const agentDeltaList =
            Object.keys(
                agentLeadMap
            )
                .map(agentKey => {
                    const count =
                        Number(
                            agentLeadMap[
                                agentKey
                            ] || 0
                        );

                    const previous =
                        Number(
                            prevLeadMap[
                                agentKey
                            ] || 0
                        );

                    return {
                        key: agentKey,

                        name:
                            agentDisplayNameMap[
                                agentKey
                            ] ||
                            agentKey,

                        count,

                        prev:
                            previous,

                        added:
                            Math.max(
                                0,
                                count -
                                    previous
                            )
                    };
                })
                .filter(agent => {
                    return (
                        agent.added > 0
                    );
                })
                .sort((a, b) => {
                    return (
                        b.added -
                            a.added ||
                        b.count -
                            a.count ||
                        a.name.localeCompare(
                            b.name
                        )
                    );
                });

        const newLeadsThisUpload =
            agentDeltaList.reduce(
                (total, agent) => {
                    return (
                        total +
                        agent.added
                    );
                },
                0
            );

        const reportObj = {
            filename:
                _asStagedFile.name,

            reportDate:
                finalDateStr,

            dayOfWeek:
                dayName,

            uploadedAt:
                new Date().toISOString(),

            expiresAt:
                expiryDate.toISOString(),

            author:
                adminName,

            data:
                _asStagedParsed
        };

        try {
            if (
                typeof window.saveAgentReportToFirebase !==
                'function'
            ) {
                throw new Error(
                    'Firebase report save function is unavailable.'
                );
            }

            const result =
                await window.saveAgentReportToFirebase(
                    reportObj
                );

            if (
                !result ||
                !result.success ||
                !result.id
            ) {
                throw new Error(
                    result &&
                    result.error
                        ? String(
                            result.error
                        )
                        : 'Firebase did not return the new report ID.'
                );
            }

            const newlySavedReport = {
                id: result.id,
                ...reportObj
            };

            currentReportData =
                newlySavedReport;

            _asLastUploadedDateLabel =
                normalizedFinalDate;

            allReports =
                allReports.filter(
                    report => {
                        return (
                            normalizeReportDateLabel(
                                report.reportDate
                            ) !==
                            normalizedFinalDate
                        );
                    }
                );

            allReports.unshift(
                newlySavedReport
            );

            window.allAgentReports =
                allReports;

            renderHistoryList();

            viewReport(
                newlySavedReport.id
            );

            await autoPushReportToDashboard(
                newlySavedReport
            );

            lastAutoPushedReportId =
                newlySavedReport.id;

            if (
                typeof window.deleteAgentReportFromFirebase ===
                'function'
            ) {
                for (
                    const oldReport of
                    existingReportsForDate
                ) {
                    if (
                        oldReport &&
                        oldReport.id &&
                        oldReport.id !==
                            newlySavedReport.id
                    ) {
                        await window.deleteAgentReportFromFirebase(
                            oldReport.id
                        );
                    }
                }
            }

            updateStatsStatus(
                `✅ Saved fresh report! ${totalRows} rows, ${totalLeads} qualified leads. Daily Agent Stats and the live dashboard were updated.`,
                false
            );

            if (
                typeof window.writeAdminActivityLog ===
                'function'
            ) {
                window.writeAdminActivityLog(
                    'upload_stats',
                    `Uploaded fresh report: ${_asStagedFile.name} (${totalRows} rows, ${totalLeads} leads)`
                );
            }

            if (
                newLeadsThisUpload >
                    0 &&
                typeof window.triggerCsvUploadAlert ===
                    'function'
            ) {
                await window.triggerCsvUploadAlert(
                    newLeadsThisUpload,

                    agentDeltaList.map(
                        agent => {
                            return {
                                name:
                                    agent.name,

                                count:
                                    agent.count,

                                prev:
                                    agent.prev,

                                added:
                                    agent.added
                            };
                        }
                    )
                );
            }

            const uploadPanel =
                document.getElementById(
                    'as-upload-panel'
                );

            if (uploadPanel) {
                uploadPanel.classList.add(
                    'hidden'
                );
            }

            const fileInput =
                document.getElementById(
                    'as-file-input'
                );

            if (fileInput) {
                fileInput.value = '';
            }

            _asStagedFile = null;
            _asStagedParsed = null;
            _asStagedDateStr = null;
            _asStagedParsedDate =
                null;

            previousReportData =
                null;

            setTimeout(() => {
                updateStatsStatus(
                    '',
                    false
                );
            }, 5000);
        } catch (error) {
            console.error(
                '[Agent Stats Upload Error]',
                error
            );

            updateStatsStatus(
                `❌ Upload failed: ${
                    error &&
                    error.message
                        ? error.message
                        : 'Unknown error'
                }`,
                true
            );
        }
    };

async function handleFileUpload(
    file
) {
    if (
        !file.name
            .toLowerCase()
            .endsWith('.csv')
    ) {
        updateStatsStatus(
            '❌ Please upload a CSV file',
            true
        );

        return;
    }

    updateStatsStatus(
        '<i class="fas fa-spinner fa-spin mr-2"></i> Reading file...',
        false
    );

    let fileDateStr = null;

    const dateMatch =
        file.name.match(
            /(\d{2})[-_](\d{2})[-_](\d{4})/
        );

    if (dateMatch) {
        fileDateStr =
            `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
    }

    if (!fileDateStr) {
        fileDateStr =
            file.name.replace(
                /\.csv$/i,
                ''
            );
    }

    const text =
        await file.text();

    let lines =
        text.split(/\r?\n/);

    lines = lines.filter(line => {
        return (
            line.trim().length > 0
        );
    });

    if (
        lines.length === 0
    ) {
        updateStatsStatus(
            '❌ File is empty',
            true
        );

        return;
    }

    const firstLine =
        lines[0];

    const delimiter =
        detectDelimiter(
            firstLine
        );

    console.log(
        `[Upload] Detected delimiter: "${delimiter}"`
    );

    let headers =
        parseCSVRow(
            firstLine,
            delimiter
        );

    let headerIndex = 0;

    for (
        let index = 0;
        index <
        Math.min(
            lines.length,
            5
        );
        index++
    ) {
        const testHeaders =
            parseCSVRow(
                lines[index],
                delimiter
            );

        const hasAgentName =
            testHeaders.some(header => {
                const text =
                    header.toLowerCase();

                return (
                    text.includes(
                        'agent name'
                    ) ||
                    text.includes(
                        'agentname'
                    ) ||
                    text.includes(
                        'rep name'
                    ) ||
                    text.includes(
                        'representative'
                    )
                );
            });

        if (hasAgentName) {
            headerIndex =
                index;

            headers =
                testHeaders;

            console.log(
                `[Upload] Found header row at line ${index}:`,
                headers
            );

            break;
        }
    }

    let agentIdIndex = -1;
    let agentNameIndex = -1;
    let statusIndex = -1;
    let durationIndex = -1;
    let teamIndex = -1;
    let leadNumberIndex = -1;

    headers.forEach(
        (header, index) => {
            const lower =
                header
                    .toLowerCase()
                    .replace(
                        /[\s_-]/g,
                        ''
                    );

            if (
                lower.includes(
                    'agentid'
                ) ||
                lower === 'userid' ||
                lower === 'id'
            ) {
                agentIdIndex =
                    index;
            }

            if (
                lower.includes(
                    'agentname'
                ) ||
                lower === 'name' ||
                lower === 'agent'
            ) {
                agentNameIndex =
                    index;
            }

            if (
                lower.includes(
                    'currentstatus'
                ) ||
                lower === 'status' ||
                lower ===
                    'disposition'
            ) {
                statusIndex =
                    index;
            }

            if (
                lower.includes(
                    'duration'
                ) ||
                lower === 'dur' ||
                lower === 'talktime'
            ) {
                durationIndex =
                    index;
            }

            if (
                lower.includes(
                    'team'
                ) ||
                lower.includes(
                    'prefix'
                )
            ) {
                teamIndex =
                    index;
            }

            if (
                lower.includes(
                    'leadnumber'
                ) ||
                lower.includes(
                    'phonenumber'
                ) ||
                lower === 'number' ||
                lower ===
                    'customernumber' ||
                lower ===
                    'dialednumber'
            ) {
                leadNumberIndex =
                    index;
            }
        }
    );

    if (
        agentNameIndex === -1
    ) {
        agentNameIndex = 0;
    }

    if (
        statusIndex === -1 &&
        headers.length > 2
    ) {
        statusIndex = 2;
    }

    if (
        durationIndex === -1 &&
        headers.length > 3
    ) {
        durationIndex = 3;
    }

    if (
        leadNumberIndex === -1 &&
        headers.length > 5
    ) {
        leadNumberIndex = 5;
    }

    console.log(
        `[Upload] Column mapping - Name:${agentNameIndex}, Status:${statusIndex}, Duration:${durationIndex}, AgentId:${agentIdIndex}, Team:${teamIndex}, LeadNumber:${leadNumberIndex}`
    );

    const parsedData = [];

    for (
        let index =
            headerIndex + 1;
        index <
        lines.length;
        index++
    ) {
        const line =
            lines[index].trim();

        if (!line) {
            continue;
        }

        const values =
            parseCSVRow(
                line,
                delimiter
            );

        if (
            values.length < 3
        ) {
            continue;
        }

        const agentId =
            agentIdIndex >= 0
                ? values[
                    agentIdIndex
                ] || ''
                : '';

        const agentNameRaw =
            agentNameIndex >= 0
                ? values[
                    agentNameIndex
                ] || ''
                : '';

        if (
            agentNameRaw &&
            /^PH(?![A-Za-z])/i.test(
                agentNameRaw
            )
        ) {
            continue;
        }

        if (
            !agentNameRaw.trim() ||
            agentNameRaw
                .trim()
                .toUpperCase() ===
                'UNKNOWN'
        ) {
            continue;
        }

        const status =
            statusIndex >= 0
                ? String(
                    values[
                        statusIndex
                    ] || ''
                ).toUpperCase()
                : '';

        const durationRaw =
            durationIndex >= 0
                ? String(
                    values[
                        durationIndex
                    ] || '0'
                )
                : '0';

        const leadNumber =
            leadNumberIndex >= 0
                ? values[
                    leadNumberIndex
                ] || ''
                : '';

        let team = 'PR';

        const upperRaw =
            agentNameRaw
                .toUpperCase()
                .trim();

        if (
            upperRaw.startsWith(
                'GYB '
            ) ||
            upperRaw.startsWith(
                'GYB\t'
            )
        ) {
            team = 'BB';
        } else if (
            upperRaw.startsWith(
                'GYP '
            ) ||
            upperRaw.startsWith(
                'GYP\t'
            )
        ) {
            team = 'PR';
        } else if (
            upperRaw.startsWith(
                'GTM '
            ) ||
            upperRaw.startsWith(
                'GTM\t'
            )
        ) {
            team = 'RM';
        } else if (
            upperRaw.startsWith(
                'RM '
            ) ||
            upperRaw.startsWith(
                'RM\t'
            )
        ) {
            team = 'RM';
        }

        if (
            teamIndex >= 0 &&
            values[teamIndex] &&
            values[
                teamIndex
            ].trim()
        ) {
            const teamValue =
                values[
                    teamIndex
                ]
                    .trim()
                    .toUpperCase();

            if (
                teamValue ===
                    'BB' ||
                teamValue ===
                    'BERB' ||
                teamValue ===
                    'BERBICE'
            ) {
                team = 'BB';
            } else if (
                teamValue ===
                    'RM' ||
                teamValue ===
                    'REMOTE'
            ) {
                team = 'RM';
            } else if (
                teamValue ===
                    'PR' ||
                teamValue ===
                    'PROV' ||
                teamValue ===
                    'PROVIDENCE'
            ) {
                team = 'PR';
            }
        }

        const agentName =
            agentNameRaw
                .replace(
                    /^(GYP|GYB|GTM|RM)\s+/i,
                    ''
                )
                .trim();

        let duration = 0;

        if (
            durationRaw.includes(
                ':'
            )
        ) {
            const parts =
                durationRaw
                    .split(':')
                    .map(Number);

            if (
                parts.length === 2
            ) {
                duration =
                    parts[0] * 60 +
                    parts[1];
            } else if (
                parts.length === 3
            ) {
                duration =
                    parts[0] *
                        3600 +
                    parts[1] *
                        60 +
                    parts[2];
            }
        } else {
            duration =
                parseInt(
                    durationRaw,
                    10
                ) || 0;
        }

        parsedData.push({
            agentId,
            agentName,
            rawName:
                agentNameRaw,
            team,
            status,
            duration,
            leadNumber
        });
    }

    if (
        parsedData.length === 0
    ) {
        updateStatsStatus(
            '❌ No valid data rows found in CSV. Check that columns are correctly detected.',
            true
        );

        return;
    }

    _asStagedFile =
        file;

    _asStagedParsed =
        parsedData;

    _asStagedDateStr =
        fileDateStr;

    if (dateMatch) {
        _asStagedParsedDate =
            new Date(
                `${dateMatch[3]}-${dateMatch[1]}-${dateMatch[2]}T12:00:00`
            );

        if (
            isNaN(
                _asStagedParsedDate
                    .getTime()
            )
        ) {
            _asStagedParsedDate =
                new Date();
        }
    } else {
        _asStagedParsedDate =
            new Date();
    }

    _asRetentionDays = 30;

    const dateInput =
        document.getElementById(
            'as-report-date-input'
        );

    if (dateInput) {
        dateInput.value =
            normalizeReportDateLabel(
                fileDateStr
            );
    }

    asSetRetention(
        _asRetentionDays || 30
    );

    const panel =
        document.getElementById(
            'as-upload-panel'
        );

    if (panel) {
        panel.classList.remove(
            'hidden'
        );
    }

    const agentLeadMap = {};

    const previewCountable =
        getCountableLeadSet(
            parsedData
        );

    parsedData.forEach(
        row => {
            const agentKey =
                normalizeAgentKey(
                    row.agentName ||
                    row.rawName
                );

            if (!agentKey) {
                return;
            }

            if (
                !Object.prototype
                    .hasOwnProperty
                    .call(
                        agentLeadMap,
                        agentKey
                    )
            ) {
                agentLeadMap[
                    agentKey
                ] = {
                    name:
                        row.agentName ||
                        row.rawName ||
                        agentKey,

                    count: 0
                };
            }

            if (
                isLead(
                    row,
                    previewCountable
                )
            ) {
                agentLeadMap[
                    agentKey
                ].count += 1;
            }
        }
    );

    const leadCount =
        Object.values(
            agentLeadMap
        ).reduce(
            (total, agent) => {
                return (
                    total +
                    agent.count
                );
            },
            0
        );

    const agentSummary =
        Object.values(
            agentLeadMap
        )
            .slice(0, 5)
            .map(agent => {
                return (
                    `${agent.name}: ${agent.count}`
                );
            })
            .join(', ');

    updateStatsStatus(
        `✅ Ready: ${parsedData.length} rows, ${leadCount} qualified leads (duration >= 120 sec). ${agentSummary}${
            Object.keys(
                agentLeadMap
            ).length > 5
                ? '...'
                : ''
        }. This will REPLACE previous data.`,
        false
    );

    console.log(
        '[File Upload] Delimiter used:',
        delimiter
    );

    console.log(
        '[File Upload] Per-agent lead counts:',
        agentLeadMap
    );
}

function updateStatsStatus(
    message,
    isError
) {
    const element =
        document.getElementById(
            'as-upload-status'
        );

    if (!element) {
        return;
    }

    element.innerHTML =
        message;

    element.className =
        'mt-4 text-[10px] text-center font-bold ' +
        (
            isError
                ? 'text-red-400'
                : 'text-cyan-400'
        );
}

function renderHistoryList() {
    const list =
        document.getElementById(
            'as-history-list'
        );

    if (!list) {
        return;
    }

    if (
        allReports.length === 0
    ) {
        list.innerHTML = `
            <div class="text-center text-slate-500 text-xs py-8">
                No reports found.
            </div>
        `;

        return;
    }

    const sorted = [
        ...allReports
    ].sort((a, b) => {
        return (
            new Date(
                b.uploadedAt || 0
            ) -
            new Date(
                a.uploadedAt || 0
            )
        );
    });

    list.innerHTML =
        sorted.map(report => {
            const isActive =
                currentReportData &&
                currentReportData.id ===
                    report.id;

            const uploadDateTime =
                new Date(
                    report.uploadedAt
                ).toLocaleString();

            const niceDate =
                normalizeReportDateLabel(
                    report.reportDate
                );

            const currentAdmin =
                JSON.parse(
                    sessionStorage.getItem(
                        'currentAdmin'
                    ) || '{}'
                );

            const currentEmail =
                String(
                    currentAdmin.email ||
                    ''
                ).toLowerCase();

            const canDelete =
                currentEmail ===
                    'rose' ||
                currentEmail ===
                    'momo' ||
                currentAdmin.role ===
                    'super_admin' ||
                currentAdmin.isSuper;

            const deleteButton =
                canDelete
                    ? `
                        <button
                            onclick="event.stopPropagation(); window.asDeleteReport('${report.id}')"
                            class="text-[10px] text-red-400 hover:text-red-300 ml-2 px-2 py-1 rounded-md hover:bg-red-500/10"
                            title="Delete this report"
                        >
                            <i class="fas fa-trash"></i>
                        </button>
                    `
                    : '';

            return `
                <div
                    onclick="window.viewReport('${report.id}')"
                    class="report-item bg-black/20 p-3 rounded-xl cursor-pointer flex items-center justify-between gap-2 ${
                        isActive
                            ? 'active'
                            : ''
                    }"
                >
                    <div class="min-w-0">
                        <div class="text-xs font-bold text-white truncate">
                            📊 ${niceDate}
                        </div>

                        <div class="text-[8px] text-slate-500 mt-1 truncate">
                            ${escapeHtml(
                                report.author ||
                                'Admin'
                            )} • ${uploadDateTime}
                        </div>
                    </div>

                    ${deleteButton}
                </div>
            `;
        }).join('');
}

window.viewReport =
    function (id) {
        const report =
            allReports.find(
                item => {
                    return (
                        item.id === id
                    );
                }
            );

        if (!report) {
            return;
        }

        currentReportData =
            report;

        renderHistoryList();

        const uploadDateTime =
            new Date(
                report.uploadedAt
            ).toLocaleString();

        document
            .querySelectorAll(
                '#as-report-title'
            )
            .forEach(element => {
                element.innerText =
                    '📊 Report: ' +
                    normalizeReportDateLabel(
                        report.reportDate
                    );
            });

        document
            .querySelectorAll(
                '#as-report-date'
            )
            .forEach(element => {
                element.innerHTML = `
                    <i class="far fa-calendar-alt mr-1"></i>
                    ${uploadDateTime}
                `;
            });

        document
            .querySelectorAll(
                '#as-report-author'
            )
            .forEach(element => {
                element.innerHTML = `
                    <i class="far fa-user mr-1"></i>
                    ${escapeHtml(
                        report.author ||
                        'Admin'
                    )}
                `;
            });

        const deleteButtons =
            document.querySelectorAll(
                '#as-delete-btn'
            );

        deleteButtons.forEach(
            deleteButton => {
                const currentAdmin =
                    JSON.parse(
                        sessionStorage.getItem(
                            'currentAdmin'
                        ) || '{}'
                    );

                const currentEmail =
                    String(
                        currentAdmin.email ||
                        ''
                    ).toLowerCase();

                const canDelete =
                    currentEmail ===
                        'rose' ||
                    currentEmail ===
                        'momo' ||
                    currentAdmin.role ===
                        'super_admin' ||
                    currentAdmin.isSuper;

                if (canDelete) {
                    deleteButton.classList.remove(
                        'hidden'
                    );

                    deleteButton.onclick =
                        () => {
                            if (
                                confirm(
                                    'Delete this report?'
                                )
                            ) {
                                if (
                                    typeof window.deleteAgentReportFromFirebase ===
                                    'function'
                                ) {
                                    window.deleteAgentReportFromFirebase(
                                        id
                                    );

                                    currentReportData =
                                        null;
                                }
                            }
                        };
                } else {
                    deleteButton.classList.add(
                        'hidden'
                    );
                }
            }
        );

        const pushButtons =
            document.querySelectorAll(
                '#as-push-btn'
            );

        pushButtons.forEach(
            pushButton => {
                const currentAdmin =
                    JSON.parse(
                        sessionStorage.getItem(
                            'currentAdmin'
                        ) || '{}'
                    );

                const currentEmail =
                    String(
                        currentAdmin.email ||
                        ''
                    ).toLowerCase();

                const canPush =
                    currentEmail ===
                        'rose' ||
                    currentEmail ===
                        'momo' ||
                    currentAdmin.role ===
                        'super_admin' ||
                    currentAdmin.isSuper;

                if (canPush) {
                    pushButton.classList.remove(
                        'hidden'
                    );

                    pushButton.onclick =
                        async () => {
                            if (
                                confirm(
                                    `Push ${report.reportDate} to Live Dashboard?`
                                )
                            ) {
                                await autoPushReportToDashboard(
                                    report
                                );

                                pushButton.innerHTML =
                                    '✅ Pushed!';

                                setTimeout(
                                    () => {
                                        pushButton.innerHTML =
                                            '🚀 Push to Daily Board';
                                    },
                                    2000
                                );
                            }
                        };
                } else {
                    pushButton.classList.add(
                        'hidden'
                    );
                }
            }
        );

        renderActiveReportTable();
    };

function renderActiveReportTable() {
    if (!currentReportData) {
        return;
    }

    const rawRows =
        (
            currentReportData.data ||
            []
        ).filter(row => {
            return !isPhTrainingName(
                row &&
                (
                    row.rawName ||
                    row.agentName
                )
            );
        });

    const activeCountable =
        getCountableLeadSet(
            rawRows
        );

    const agentMap = {};

    rawRows.forEach(row => {
        const agentKey =
            normalizeAgentKey(
                row.agentName ||
                row.rawName
            );

        if (!agentKey) {
            return;
        }

        if (!agentMap[agentKey]) {
            agentMap[agentKey] = {
                name:
                    row.agentName ||
                    row.rawName ||
                    agentKey,

                rawName:
                    row.rawName ||
                    row.agentName ||
                    agentKey,

                agentId:
                    row.agentId ||
                    '',

                team:
                    row.team ||
                    'PR',

                calls: 0,
                leads: 0,
                rows: []
            };
        }

        agentMap[
            agentKey
        ].calls += 1;

        agentMap[
            agentKey
        ].rows.push(row);

        if (
            isLead(
                row,
                activeCountable
            )
        ) {
            agentMap[
                agentKey
            ].leads += 1;
        }
    });

    const agentRows =
        Object.values(
            agentMap
        );

    const totalLeads =
        agentRows.reduce(
            (total, agent) => {
                return (
                    total +
                    agent.leads
                );
            },
            0
        );

    const totalCalls =
        rawRows.length;

    const agentCount =
        agentRows.length;

    document
        .querySelectorAll(
            '#as-stat-agents'
        )
        .forEach(element => {
            element.innerText =
                agentCount;
        });

    document
        .querySelectorAll(
            '#as-stat-calls'
        )
        .forEach(element => {
            element.innerText =
                totalCalls;
        });

    document
        .querySelectorAll(
            '#as-stat-transfers'
        )
        .forEach(element => {
            element.innerText =
                totalLeads;
        });

    document
        .querySelectorAll(
            '#as-stat-rate'
        )
        .forEach(element => {
            element.innerText =
                totalCalls > 0
                    ? (
                        (
                            totalLeads /
                            totalCalls
                        ) *
                        100
                    ).toFixed(1) +
                    '%'
                    : '0%';
        });

    let searchValue = '';

    const searchInput =
        document.getElementById(
            'as-search-input'
        );

    if (searchInput) {
        searchValue =
            searchInput.value
                .toLowerCase()
                .trim();
    }

    let displayAgents =
        agentRows;

    if (searchValue) {
        displayAgents =
            agentRows.filter(agent => {
                return (
                    agent.name
                        .toLowerCase()
                        .includes(
                            searchValue
                        ) ||
                    agent.rawName
                        .toLowerCase()
                        .includes(
                            searchValue
                        ) ||
                    String(
                        agent.agentId
                    )
                        .toLowerCase()
                        .includes(
                            searchValue
                        )
                );
            });
    }

    const tableBodies =
        document.querySelectorAll(
            '#as-table-body'
        );

    if (
        displayAgents.length === 0
    ) {
        tableBodies.forEach(
            tableBody => {
                tableBody.innerHTML = `
                    <tr>
                        <td
                            colspan="5"
                            class="p-8 text-center text-slate-500"
                        >
                            No agents found.
                        </td>
                    </tr>
                `;
            }
        );

        return;
    }

    const html =
        displayAgents.map(
            agent => {
                const leadRate =
                    agent.calls > 0
                        ? (
                            (
                                agent.leads /
                                agent.calls
                            ) *
                            100
                        ).toFixed(1)
                        : '0.0';

                return `
                    <tr class="border-b border-white/5 hover:bg-white/5 transition">
                        <td class="p-3 text-slate-500 text-[11px] font-mono">
                            ${escapeHtml(
                                agent.agentId
                            )}
                        </td>

                        <td class="p-3">
                            <div class="font-bold text-white text-[12px] uppercase">
                                ${escapeHtml(
                                    agent.rawName ||
                                    agent.name
                                )}
                            </div>

                            <div class="text-[9px] text-slate-500 mt-1">
                                ${escapeHtml(
                                    agent.team
                                )}
                            </div>
                        </td>

                        <td class="p-3 text-center text-slate-300 text-[11px]">
                            ${agent.calls}
                        </td>

                        <td class="p-3 text-center text-cyan-400 text-[12px] font-black">
                            ${agent.leads}
                        </td>

                        <td class="p-3 text-right text-slate-400 text-[11px] font-bold">
                            ${leadRate}%
                        </td>
                    </tr>
                `;
            }
        ).join('');

    tableBodies.forEach(
        tableBody => {
            tableBody.innerHTML =
                html;
        }
    );
}

window.asDeleteReport =
    async function (id) {
        if (!id) {
            return;
        }

        if (
            !confirm(
                'Delete this report? This cannot be undone.'
            )
        ) {
            return;
        }

        if (
            typeof window.deleteAgentReportFromFirebase ===
            'function'
        ) {
            await window.deleteAgentReportFromFirebase(
                id
            );

            allReports =
                allReports.filter(
                    report => {
                        return (
                            report.id !== id
                        );
                    }
                );

            window.allAgentReports =
                allReports;

            if (
                currentReportData &&
                currentReportData.id ===
                    id
            ) {
                currentReportData =
                    null;

                const sorted = [
                    ...allReports
                ].sort((a, b) => {
                    return (
                        new Date(
                            b.uploadedAt || 0
                        ) -
                        new Date(
                            a.uploadedAt || 0
                        )
                    );
                });

                if (sorted[0]) {
                    currentReportData =
                        sorted[0];

                    viewReport(
                        sorted[0].id
                    );
                } else {
                    renderHistoryList();

                    const tableBodies =
                        document.querySelectorAll(
                            '#as-table-body'
                        );

                    tableBodies.forEach(
                        tableBody => {
                            tableBody.innerHTML = `
                                <tr>
                                    <td
                                        colspan="5"
                                        class="p-8 text-center text-slate-500"
                                    >
                                        No report selected.
                                    </td>
                                </tr>
                            `;
                        }
                    );
                }
            } else {
                renderHistoryList();
            }
        }
    };

window.asDeleteAllPrevious =
    async function () {
        if (
            !Array.isArray(
                allReports
            ) ||
            allReports.length === 0
        ) {
            return;
        }

        const sorted = [
            ...allReports
        ].sort((a, b) => {
            return (
                new Date(
                    b.uploadedAt || 0
                ) -
                new Date(
                    a.uploadedAt || 0
                )
            );
        });

        const latest =
            sorted[0];

        const toDelete =
            sorted.slice(1);

        if (
            toDelete.length === 0
        ) {
            alert(
                'No previous reports to delete.'
            );

            return;
        }

        if (
            !confirm(
                `Delete ${toDelete.length} previous report${
                    toDelete.length === 1
                        ? ''
                        : 's'
                }? The most recent (${normalizeReportDateLabel(
                    latest.reportDate
                )}) will be kept.`
            )
        ) {
            return;
        }

        for (
            const report of toDelete
        ) {
            if (
                typeof window.deleteAgentReportFromFirebase ===
                'function'
            ) {
                await window.deleteAgentReportFromFirebase(
                    report.id
                );
            }
        }

        allReports = [
            latest
        ];

        window.allAgentReports =
            allReports;

        currentReportData =
            latest;

        renderHistoryList();

        viewReport(
            latest.id
        );

        if (
            typeof window.writeAdminActivityLog ===
            'function'
        ) {
            window.writeAdminActivityLog(
                'delete_previous_reports',
                `Deleted ${toDelete.length} previous reports`
            );
        }
    };

function escapeHtml(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return '';
    }

    return String(value).replace(
        /[&<>"']/g,
        character => {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };

            return map[
                character
            ];
        }
    );
}
