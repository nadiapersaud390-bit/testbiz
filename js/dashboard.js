    } else {
        fullList = agents
            .filter(a => !(a.name && String(a.name).toUpperCase().startsWith('PH ')))
            .map(a => ({
                name: typeof stripPrefix === 'function' ? stripPrefix(a.name).toUpperCase() : a.name,
                leads: isWeekly ? (a.weeklyLeads || 0) : (a.dailyLeads || 0),
                team: normalizeTeam(a.team, a.name),
                ytelId: a.ytelId || ''
            }));

        // Merge in the full master roster so every agent appears,
        // even those without pushed leads for the current view.
        const roster = window.allAgentProfiles || window.biz_master_roster || [];
        if (roster.length) {
            roster.forEach(p => {
                const rosterName = (p.fullName || p.name || '').trim();
                if (!rosterName) return;
                if (rosterName.toUpperCase().startsWith('PH ')) return;

                const cleanName = (typeof stripPrefix === 'function' ? stripPrefix(rosterName) : rosterName).toUpperCase();
                const rosterId = String(p.userId || p.ytelId || '');

                const exists = fullList.some(a =>
                    (rosterId && String(a.ytelId) === rosterId) ||
                    (a.name && a.name.trim().toUpperCase() === cleanName)
                );
                if (!exists) {
                    fullList.push({
                        name: cleanName,
                        leads: 0,
                        team: normalizeTeam(p.team, rosterName),
                        ytelId: rosterId
                    });
                }
            });
        }

        fullList.sort((a, b) => b.leads - a.leads);

        fullList.forEach(a => {
            if (a.team === 'PR') prTotal += a.leads;
            else if (a.team === 'BB') bbTotal += a.leads;
            else if (a.team === 'RM') rmTotal += a.leads;
        });
    }
