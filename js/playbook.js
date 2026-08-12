// js/playbook.js
// Legacy compatibility helper. The Playbook interface is loaded from
// tabs/playbook.html by the dashboard tab loader.
(function () {
    'use strict';

    if (typeof window.toggleIndustry !== 'function') {
        window.toggleIndustry = function (header) {
            if (!header) return;
            const card = header.closest('.industry-card');
            if (!card) return;
            const body = card.querySelector('.industry-body');
            const arrow = header.querySelector('.industry-arrow');
            if (!body) return;
            const isOpen = body.classList.contains('open');
            document.querySelectorAll('.industry-body.open').forEach(el => el.classList.remove('open'));
            document.querySelectorAll('.industry-arrow.open').forEach(el => el.classList.remove('open'));
            if (!isOpen) {
                body.classList.add('open');
                if (arrow) arrow.classList.add('open');
            }
        };
    }

    if (typeof window.toggleRevenueDropdown !== 'function') {
        window.toggleRevenueDropdown = function () {
            const body = document.getElementById('revenue-body');
            const arrow = document.getElementById('revenue-arrow');
            if (!body) return;
            const willOpen = !body.classList.contains('open');
            body.classList.toggle('open', willOpen);
            if (arrow) arrow.classList.toggle('open', willOpen);
        };
    }
})();
