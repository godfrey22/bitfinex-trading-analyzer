class TradeAnalyzer {
    constructor() {
        this.trades = new Map();
        this.tradingPairs = new Set();
        this.debugMode = false;
        this.dateFormat = 'DD-MM-YY HH:mm:ss'; // default format
        this.validDateFormats = [
            'DD-MM-YY HH:mm:ss',
            'YYYY-MM-DD HH:mm:ss',
            'MM/DD/YYYY HH:mm:ss'
        ];
        this.standardDateFormat = 'YYYY-MM-DD HH:mm:ss';
        this.dateParsingStats = {
            totalProcessed: 0,
            successfullyParsed: 0,
            formatCounts: {},
            errors: []
        };
        
        this.dateFormats = {
            DDMMYY: {
                pattern: /^\d{2}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/,
                parse: (str) => {
                    const [date, time] = str.split(' ');
                    const [dd, mm, yy] = date.split('-');
                    const year = '20' + yy; // Assuming 20xx years
                    return `${year}-${mm}-${dd} ${time}`;
                }
            },
            MDYYYY: {
                pattern: /^\d{1,2}\/\d{1,2}\/\d{4}\s\d{1,2}:\d{2}$/,
                parse: (str) => {
                    const [date, time] = str.split(' ');
                    const [m, d, yyyy] = date.split('/');
                    const paddedMonth = m.padStart(2, '0');
                    const paddedDay = d.padStart(2, '0');
                    const paddedTime = time.includes(':') ? time.padStart(8, '0') : time + ':00';
                    return `${yyyy}-${paddedMonth}-${paddedDay} ${paddedTime}`;
                }
            }
        };
        this.tradePairs = new Map(); // Store paired trades
        this.selectedTrades = new Set(); // Currently selected trades for pairing
        this.pairingMode = false;
        this.pairsFilename = 'trade_pairs.json';
        this.initializePairsFileInput();
        this.loadSavedPairs();
        this.initializeEventListeners();
        this.initializeSettingsPanel();
        this.initializePairingFeatures();
        this.initializePairedTradesView();
    }

    initializeEventListeners() {
        // Required elements
        const csvFile = document.getElementById('csvFile');
        const pairSelect = document.getElementById('pairSelect');
        const searchTrades = document.getElementById('searchTrades');
        const timeRange = document.getElementById('timeRange');
        const debugToggle = document.getElementById('debugToggle');
        const settingsToggle = document.getElementById('settingsToggle');
        const dateFormat = document.getElementById('dateFormat');
        const expandAll = document.getElementById('expandAll');

        // Add event listeners only if elements exist
        if (csvFile) {
            csvFile.addEventListener('change', (e) => this.handleFiles(e.target.files));
        }
        if (pairSelect) {
            pairSelect.addEventListener('change', (e) => this.analyzePair(e.target.value));
        }
        if (timeRange) {
            timeRange.addEventListener('change', (e) => this.filterByTimeRange(e.target.value));
        }
        if (searchTrades) {
            searchTrades.addEventListener('input', (e) => this.searchTrades(e.target.value));
        }
        if (dateFormat) {
            dateFormat.addEventListener('change', (e) => this.updateDateFormat(e.target.value));
        }
        if (debugToggle) {
            debugToggle.addEventListener('change', (e) => this.toggleDebugMode(e.target.checked));
        }
        if (expandAll) {
            expandAll.addEventListener('click', () => this.toggleAllTrades());
        }

        // Log warning for missing elements in debug mode
        if (this.debugMode) {
            const requiredElements = {
                csvFile, pairSelect, searchTrades, timeRange, 
                debugToggle, settingsToggle, dateFormat, expandAll
            };
            
            Object.entries(requiredElements).forEach(([name, element]) => {
                if (!element) {
                    console.warn(`Missing element: ${name}`);
                }
            });
        }
    }

    initializeSettingsPanel() {
        const settingsToggle = document.getElementById('settingsToggle');
        const settingsPanel = document.getElementById('settingsPanel');
        
        settingsToggle.addEventListener('click', () => {
            settingsPanel.classList.toggle('visible');
        });
    }

    initializePairingFeatures() {
        const toggleButton = document.getElementById('togglePairingMode');
        const confirmButton = document.getElementById('confirmPair');
        const pairFilter = document.getElementById('pairFilter');
        const exportButton = document.getElementById('exportPairs');

        if (toggleButton) {
            toggleButton.addEventListener('click', () => {
                this.pairingMode = !this.pairingMode;
                toggleButton.classList.toggle('active');
                document.getElementById('pairingControls').classList.toggle('visible');
                this.selectedTrades.clear();
                this.analyzePair(document.getElementById('pairSelect').value);
                console.log('Pairing mode:', this.pairingMode); // Debug log
            });
        }

        if (confirmButton) {
            confirmButton.addEventListener('click', () => {
                console.log('Selected trades:', this.selectedTrades); // Debug log
                this.createTradePair();
            });
        }

        if (pairFilter) {
            pairFilter.addEventListener('change', (e) => {
                console.log('Filter changed:', e.target.value); // Debug log
                this.filterPairedTrades(e.target.value);
            });
        }

        if (exportButton) {
            exportButton.addEventListener('click', () => this.exportPairsAnalysis());
        }
    }

    initializePairedTradesView() {
        this.initializeCharts();
        
        // Add event listeners for cycle view
        const exportCycles = document.getElementById('exportCycles');
        const cycleTimeRange = document.getElementById('cycleTimeRange');
        
        if (exportCycles) {
            exportCycles.addEventListener('click', () => this.exportPairsAnalysis());
        }
        
        if (cycleTimeRange) {
            cycleTimeRange.addEventListener('change', (e) => this.filterCycles(e.target.value));
        }
        
        this.renderTradeCycles();
    }

    renderTradeCycles() {
        const cycles = this.analyzeTradeCycles();
        this.updateCycleSummaryMetrics(cycles);
        this.renderCyclesTable(cycles);
        this.updateVisualizationCharts(cycles);
    }

    analyzeTradeCycles(quoteCurrency = null) {
        const cycles = Array.from(this.tradePairs.values()).map(pair => {
            // Get all valid trades for this pair
            const trades = pair.trades
                .map(orderId => this.trades.get(orderId))
                .filter(trade => trade !== undefined);

            if (trades.length < 2) {
                console.warn('Cycle has less than 2 valid trades:', pair);
                return null;
            }

            // Check if quote currency matches (if specified)
            if (quoteCurrency) {
                const [, quote] = trades[0].pair.split('/');
                if (quote !== quoteCurrency) {
                    return null;
                }
            }

            try {
                const entryTrades = trades.filter(t => t.totalAmount > 0);
                const exitTrades = trades.filter(t => t.totalAmount < 0);

                if (entryTrades.length === 0 || exitTrades.length === 0) {
                    console.warn('Cycle missing entry or exit trades:', pair);
                    return null;
                }

                const [, quoteCurrency] = trades[0].pair.split('/');
                const entryDate = new Date(Math.min(...entryTrades.map(t => new Date(t.date))));
                const exitDate = new Date(Math.max(...exitTrades.map(t => new Date(t.date))));
                const holdDuration = exitDate - entryDate;

                const totalEntry = entryTrades.reduce((sum, t) => sum + t.totalValue, 0);
                const totalExit = Math.abs(exitTrades.reduce((sum, t) => sum + t.totalValue, 0));
                const totalFees = trades.reduce((sum, t) => sum + t.totalFees, 0);
                const pnl = totalExit - totalEntry - totalFees;
                const roi = (pnl / totalEntry) * 100;

                return {
                    id: pair.id,
                    name: pair.name,
                    quoteCurrency,
                    entryDate,
                    exitDate,
                    holdDuration,
                    entryPrice: totalEntry / entryTrades.reduce((sum, t) => sum + t.totalAmount, 0),
                    exitPrice: totalExit / Math.abs(exitTrades.reduce((sum, t) => sum + t.totalAmount, 0)),
                    positionSize: entryTrades.reduce((sum, t) => sum + t.totalAmount, 0),
                    pnl,
                    roi,
                    totalFees,
                    trades: pair.trades
                };
            } catch (error) {
                console.error('Error processing cycle:', pair, error);
                return null;
            }
        }).filter(cycle => cycle !== null);

        return cycles.sort((a, b) => b.exitDate - a.exitDate);
    }

    renderCyclesTable(cycles) {
        const tbody = document.getElementById('tradeCyclesBody');
        tbody.innerHTML = '';

        // Track totals by currency
        const totals = {};

        cycles.forEach(cycle => {
            const row = document.createElement('tr');
            row.className = cycle.pnl >= 0 ? 'profitable' : 'loss';
            row.innerHTML = `
                <td>
                    <div class="cycle-name">${cycle.name}</div>
                </td>
                <td>
                    <div class="date-range">
                        <span>${this.formatDate(cycle.entryDate)}</span>
                        <i class="fas fa-arrow-right"></i>
                        <span>${this.formatDate(cycle.exitDate)}</span>
                    </div>
                </td>
                <td>${this.formatDuration(cycle.holdDuration)}</td>
                <td>${cycle.positionSize.toFixed(8)}</td>
                <td>${cycle.entryPrice.toFixed(2)} ${cycle.quoteCurrency}</td>
                <td>${cycle.exitPrice.toFixed(2)} ${cycle.quoteCurrency}</td>
                <td class="${cycle.roi >= 0 ? 'positive' : 'negative'}">
                    ${((cycle.exitPrice - cycle.entryPrice) / cycle.entryPrice * 100).toFixed(2)}%
                    <i class="fas fa-${cycle.roi >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                </td>
                <td class="${cycle.roi >= 0 ? 'positive' : 'negative'}">
                    ${cycle.roi.toFixed(2)}%
                </td>
                <td class="${cycle.pnl >= 0 ? 'positive' : 'negative'}">
                    ${cycle.pnl.toFixed(2)} ${cycle.quoteCurrency}
                </td>
                <td>$${cycle.totalFees.toFixed(2)}</td>
            `;

            row.addEventListener('click', () => this.expandCycleDetails(cycle));
            tbody.appendChild(row);

            // Update totals
            if (!totals[cycle.quoteCurrency]) {
                totals[cycle.quoteCurrency] = {
                    pnl: 0,
                    fees: 0,
                    count: 0
                };
            }
            totals[cycle.quoteCurrency].pnl += cycle.pnl;
            totals[cycle.quoteCurrency].fees += cycle.totalFees;
            totals[cycle.quoteCurrency].count += 1;
        });

        // Add summary rows
        if (cycles.length > 0) {
            // Add a separator row
            const separatorRow = document.createElement('tr');
            separatorRow.className = 'summary-separator';
            separatorRow.innerHTML = '<td colspan="10"></td>';
            tbody.appendChild(separatorRow);

            // Add a summary row for each currency
            Object.entries(totals).forEach(([currency, data]) => {
                const summaryRow = document.createElement('tr');
                summaryRow.className = 'summary-row';
                summaryRow.innerHTML = `
                    <td colspan="7">
                        <strong>Total for ${currency} (${data.count} trades)</strong>
                    </td>
                    <td></td>
                    <td class="${data.pnl >= 0 ? 'positive' : 'negative'}">
                        <strong>${data.pnl.toFixed(2)} ${currency}</strong>
                    </td>
                    <td>
                        <strong>$${data.fees.toFixed(2)}</strong>
                    </td>
                `;
                tbody.appendChild(summaryRow);
            });
        }
    }

    expandCycleDetails(cycle) {
        console.log('Expanding cycle details:', cycle);

        const detailsRow = document.createElement('tr');
        detailsRow.className = 'cycle-details';
        detailsRow.dataset.cycleId = cycle.id;
        
        detailsRow.innerHTML = `
            <td colspan="10">
                <div class="details-grid">
                    <div class="transactions-section">
                        <h4>Transactions</h4>
                        <div class="transactions-list">
                            ${cycle.trades.map(trade => {
                                const tradeData = this.trades.get(trade);
                                if (!tradeData) return '';
                                return `
                                    <div class="transaction ${tradeData.totalAmount > 0 ? 'entry' : 'exit'}">
                                        <span>${this.formatDate(new Date(tradeData.date))}</span>
                                        <span>${tradeData.totalAmount.toFixed(8)}</span>
                                        <span>$${(tradeData.totalValue / tradeData.totalAmount).toFixed(2)}</span>
                                        <span>$${tradeData.totalFees.toFixed(2)}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    <div class="notes-section">
                        <textarea placeholder="Add notes for this trade cycle..."
                                class="cycle-notes"
                                data-cycle-id="${cycle.id}">${cycle.notes || ''}</textarea>
                    </div>
                </div>
            </td>
        `;

        // Find the existing details row if any
        const existingDetails = document.querySelector(`tr[data-cycle-id="${cycle.id}"]`);
        if (existingDetails) {
            existingDetails.remove();
        } else {
            // Find the parent row by iterating through all rows and checking the cycle name
            const rows = document.querySelectorAll('#tradeCyclesBody tr');
            let parentRow = null;
            for (const row of rows) {
                const nameElement = row.querySelector('.cycle-name');
                if (nameElement && nameElement.textContent === cycle.name) {
                    parentRow = row;
                    break;
                }
            }

            if (parentRow) {
                // Insert the details row after the parent row
                parentRow.after(detailsRow);
            } else {
                console.warn('Could not find parent row for cycle:', cycle.name);
            }
        }
    }

    normalizeDate(dateStr) {
        this.dateParsingStats.totalProcessed++;
        
        // Try each format
        for (const [formatName, format] of Object.entries(this.dateFormats)) {
            if (format.pattern.test(dateStr)) {
                try {
                    const normalized = format.parse(dateStr);
                    const parsed = new Date(normalized);
                    
                    if (!isNaN(parsed.getTime())) {
                        this.dateParsingStats.successfullyParsed++;
                        this.dateParsingStats.formatCounts[formatName] = 
                            (this.dateParsingStats.formatCounts[formatName] || 0) + 1;
                        
                        return {
                            success: true,
                            original: dateStr,
                            normalized,
                            format: formatName,
                            date: parsed
                        };
                    }
                } catch (error) {
                    // Continue to next format if parsing fails
                }
            }
        }

        // If no format matches, log error and return failure
        this.dateParsingStats.errors.push({
            date: dateStr,
            reason: 'No matching format found'
        });

        return {
            success: false,
            original: dateStr,
            error: 'Invalid date format'
        };
    }

    async handleFiles(files) {
        this.trades.clear();
        this.tradingPairs.clear();
        this.dateParsingStats = {
            totalProcessed: 0,
            successfullyParsed: 0,
            formatCounts: {},
            errors: []
        };

        for (const file of files) {
            const text = await file.text();
            const rows = text.split('\n').slice(1); // Skip header row

            rows.forEach((row, index) => {
                if (!row.trim()) return;
                
                const [, pair, amount, price, fee, feePerc, feeCurrency, date, orderId] = row.split(',');
                const dateResult = this.normalizeDate(date);
                
                const trade = {
                    orderId: orderId.trim(), // Make sure to trim whitespace
                    pair,
                    trades: [],
                    totalAmount: 0,
                    totalValue: 0,
                    totalFees: 0,
                    date: dateResult.normalized || date,
                    rawDate: date,
                    dateParseResult: dateResult,
                    rowIndex: index + 2 // +2 for 1-based indexing and header row
                };

                if (!this.trades.has(trade.orderId)) {
                    this.trades.set(trade.orderId, trade);
                }

                const existingTrade = this.trades.get(trade.orderId);
                existingTrade.trades.push({
                    amount: parseFloat(amount),
                    price: parseFloat(price),
                    fee: parseFloat(fee),
                    date: dateResult.normalized || date
                });
                existingTrade.totalAmount += parseFloat(amount);
                existingTrade.totalValue += parseFloat(amount) * parseFloat(price);
                existingTrade.totalFees += Math.abs(parseFloat(fee));

                this.tradingPairs.add(pair);
            });
        }

        this.initializeQuoteCurrencies();
        this.detectQuoteCurrencies();
        this.updatePairSelect();
        this.updateDateParsingStatus();

        // After processing CSV files, check for saved pairs
        const loadPairsButton = document.createElement('button');
        loadPairsButton.className = 'btn load-pairs-btn';
        loadPairsButton.innerHTML = '<i class="fas fa-folder-open"></i> Load Saved Pairs';
        loadPairsButton.addEventListener('click', () => {
            if (this.pairsFileInput) {
                this.pairsFileInput.click();
            } else {
                console.error('Pairs file input not initialized');
                alert('Error: Could not initialize file input');
            }
        });

        const pairingHeader = document.querySelector('.pairing-header');
        const existingLoadButton = document.getElementById('loadPairs');
        if (!existingLoadButton && pairingHeader) {
            pairingHeader.insertBefore(loadPairsButton, pairingHeader.firstChild);
        }
    }

    updatePairSelect() {
        const select = document.getElementById('pairSelect');
        select.innerHTML = '<option value="">Select a pair</option>';
        
        Array.from(this.tradingPairs).sort().forEach(pair => {
            const option = document.createElement('option');
            option.value = pair;
            option.textContent = pair;
            select.appendChild(option);
        });
    }

    analyzePair(pair) {
        if (!pair) return;

        const [base, quote] = pair.split('/');
        const pairTrades = Array.from(this.trades.values())
            .filter(trade => trade.pair === pair)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        this.updateMetrics(pairTrades, quote);
        this.renderTradesList(pairTrades);
    }

    updateMetrics(trades, quoteCurrency) {
        let totalVolume = 0;
        let totalFees = 0;
        let totalValue = 0;
        let currentPosition = 0;

        trades.forEach(trade => {
            totalVolume += Math.abs(trade.totalAmount);
            totalFees += trade.totalFees;
            currentPosition += trade.totalAmount;
            totalValue += trade.totalValue;
        });

        // Update metric cards with currency
        this.updateMetricCard('positionCard', currentPosition.toFixed(8), 
            this.calculatePositionChange(trades, currentPosition));
        this.updateMetricCard('pnlCard', `${totalValue.toFixed(2)} ${quoteCurrency}`, 
            this.calculatePnLPercentage(trades));
        this.updateMetricCard('volumeCard', `${totalVolume.toFixed(8)}`);
        this.updateMetricCard('feesCard', `${totalFees.toFixed(2)} ${quoteCurrency}`);
    }

    updateMetricCard(cardId, value, change = null) {
        const card = document.getElementById(cardId);
        card.querySelector('.metric-value').textContent = value;
        if (change !== null) {
            card.querySelector('.metric-change span').textContent = `${change}%`;
        }
    }

    renderTradesList(trades) {
        const tradesList = document.getElementById('tradesList');
        tradesList.innerHTML = '';

        let currentDate = '';
        let dateGroup;

        trades.forEach(trade => {
            const tradeDate = new Date(trade.date).toLocaleDateString();
            
            if (tradeDate !== currentDate) {
                currentDate = tradeDate;
                dateGroup = this.createDateGroup(tradeDate);
                tradesList.appendChild(dateGroup);
            }

            const tradeElement = this.createTradeElement(trade);
            dateGroup.querySelector('.trades').appendChild(tradeElement);
        });
    }

    createDateGroup(date) {
        const group = document.createElement('div');
        group.className = 'date-group';
        group.innerHTML = `
            <div class="date-header">${date}</div>
            <div class="trades"></div>
        `;
        return group;
    }

    createTradeElement(trade) {
        const isBuy = trade.totalAmount > 0;
        const dateInfo = trade.dateParseResult;
        const element = document.createElement('div');
        element.className = `trade-item ${isBuy ? 'buy' : 'sell'} 
                           ${!dateInfo.success ? 'date-parse-error' : ''}
                           ${this.hasDataIssues(trade) ? 'problematic-data' : ''}`;
        element.dataset.orderId = trade.orderId;

        // Create checkbox container and checkbox separately
        let checkboxContainer = '';
        if (this.pairingMode) {
            checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'pair-selector';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'pair-checkbox';
            checkbox.dataset.orderId = trade.orderId; // Add orderId to checkbox
            checkbox.checked = this.selectedTrades.has(trade.orderId);
            
            // Add event listener directly to the checkbox
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                console.log('Checkbox changed for orderId:', trade.orderId); // Debug log
                this.toggleTradeSelection(trade);
            });
            
            checkboxContainer.appendChild(checkbox);
        }

        // Create the rest of the trade element content
        const content = `
            <i class="fas fa-chevron-right expand-arrow" 
               onclick="this.closest('.trade-item').classList.toggle('expanded')"></i>
            
            <div class="trade-timestamp" 
                 ${this.debugMode ? `data-tooltip="Raw: ${trade.date}"` : ''}>
                ${dateInfo.success ? dateInfo.date.toISOString().replace('T', ' ').substr(0, 19) : trade.date}
                ${!dateInfo.success ? '<i class="fas fa-exclamation-triangle warning-icon"></i>' : ''}
            </div>
            
            <div class="trade-main-info">
                <span class="trade-amount ${isBuy ? 'positive' : 'negative'}">
                    ${isBuy ? '+' : '-'}${Math.abs(trade.totalAmount).toFixed(8)}
                </span>
                <span class="trade-price">
                    @ ${(trade.totalValue / trade.totalAmount).toFixed(2)}
                </span>
            </div>
            
            <div class="trade-value">
                ${(trade.totalValue).toFixed(2)} USD
            </div>
            
            <div class="trade-fees">
                -${trade.totalFees.toFixed(2)} USD
            </div>
        `;

        // Set the inner HTML for the main content
        element.innerHTML = content;

        // Insert checkbox container if in pairing mode
        if (this.pairingMode && checkboxContainer) {
            element.insertBefore(checkboxContainer, element.firstChild);
        }

        // Add pair indicator if trade is paired
        const pairInfo = this.findTradePair(trade.orderId);
        if (pairInfo) {
            element.classList.add('paired-trade');
            element.setAttribute('data-pair-id', pairInfo.pairId);
            const mainInfo = element.querySelector('.trade-main-info');
            if (mainInfo) {
                mainInfo.insertAdjacentHTML('beforeend', `
                    <span class="pair-tag">${pairInfo.name}</span>
                `);
            }
        }

        return element;
    }

    renderSubTransactions(trade) {
        return trade.trades.map(t => `
            <div class="sub-transaction">
                <span>Amount: ${t.amount.toFixed(8)}</span>
                <span>Price: ${t.price.toFixed(2)}</span>
                <span>Fee: ${t.fee.toFixed(2)}</span>
            </div>
        `).join('');
    }

    renderDebugInfo(trade) {
        const dateInfo = trade.dateParseResult;
        return `
            <div class="debug-info">
                <div class="debug-section">
                    <h4>Date Parsing Information</h4>
                    <div>Original Date: ${trade.rawDate}</div>
                    <div>Normalized Date: ${dateInfo.normalized || 'Failed to normalize'}</div>
                    <div>Format Used: ${dateInfo.format || 'None'}</div>
                    <div>Parse Status: ${dateInfo.success ? '✅ Success' : '❌ Failed'}</div>
                </div>
                <div class="debug-section">
                    <h4>Trade Details</h4>
                    <div>Order ID: ${trade.orderId || 'Missing'}</div>
                    <div>Row Index: ${trade.rowIndex}</div>
                    <div>Data Quality: ${this.calculateDataQuality(trade)}%</div>
                </div>
            </div>
        `;
    }

    calculateDataQuality(trade) {
        let score = 100;
        if (!this.parseDate(trade.date).valid) score -= 20;
        if (!trade.orderId) score -= 10;
        if (!trade.exchange) score -= 10;
        if (trade.totalFees === 0) score -= 5;
        return Math.max(0, score);
    }

    toggleDebugMode(enabled) {
        this.debugMode = enabled;
        this.analyzePair(document.getElementById('pairSelect').value);
    }

    exportErrorLog() {
        const errorLog = {
            invalidDates: [],
            dataQualityIssues: [],
            parsingErrors: []
        };
        
        this.trades.forEach(trade => {
            const dateValidation = this.parseDate(trade.date);
            if (!dateValidation.valid) {
                errorLog.invalidDates.push({
                    trade: trade.orderId,
                    date: trade.date,
                    validationDetails: dateValidation
                });
            }
            
            if (this.calculateDataQuality(trade) < 80) {
                errorLog.dataQualityIssues.push({
                    trade: trade.orderId,
                    quality: this.calculateDataQuality(trade),
                    issues: this.getQualityIssues(trade)
                });
            }
        });

        const blob = new Blob([JSON.stringify(errorLog, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'trade-analysis-error-log.json';
        a.click();
    }

    filterByTimeRange(range) {
        const currentPair = document.getElementById('pairSelect').value;
        if (!currentPair) return;

        const now = new Date();
        const filtered = Array.from(this.trades.values())
            .filter(trade => trade.pair === currentPair)
            .filter(trade => {
                const tradeDate = new Date(trade.date);
                switch(range) {
                    case 'day':
                        return tradeDate.toDateString() === now.toDateString();
                    case 'week':
                        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
                        return tradeDate >= weekAgo;
                    case 'month':
                        return tradeDate.getMonth() === now.getMonth() &&
                               tradeDate.getFullYear() === now.getFullYear();
                    case 'year':
                        return tradeDate.getFullYear() === now.getFullYear();
                    default:
                        return true;
                }
            });

        this.updateMetrics(filtered);
        this.renderTradesList(filtered);
    }

    searchTrades(query) {
        const currentPair = document.getElementById('pairSelect').value;
        if (!currentPair || !query) {
            this.analyzePair(currentPair);
            return;
        }

        const filtered = Array.from(this.trades.values())
            .filter(trade => trade.pair === currentPair)
            .filter(trade => 
                trade.date.includes(query) ||
                trade.totalAmount.toString().includes(query) ||
                trade.totalValue.toString().includes(query)
            );

        this.updateMetrics(filtered);
        this.renderTradesList(filtered);
    }

    calculatePositionChange(trades, currentPosition) {
        if (trades.length < 2) return 0;
        
        // Calculate position at the start of the period
        const oldestTrade = trades[trades.length - 1];
        const startPosition = oldestTrade.totalAmount;
        
        if (startPosition === 0) return 0;
        
        // Calculate percentage change
        const change = ((currentPosition - startPosition) / Math.abs(startPosition)) * 100;
        return change.toFixed(2);
    }

    calculatePnLPercentage(trades) {
        if (trades.length === 0) return 0;
        
        let totalCost = 0;
        let totalValue = 0;
        
        trades.forEach(trade => {
            if (trade.totalAmount > 0) { // Buy
                totalCost += Math.abs(trade.totalValue);
            } else { // Sell
                totalValue += Math.abs(trade.totalValue);
            }
        });
        
        if (totalCost === 0) return 0;
        
        const pnlPercentage = ((totalValue - totalCost) / totalCost) * 100;
        return pnlPercentage.toFixed(2);
    }

    parseDate(dateStr) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return {
                valid: true,
                date: date,
                formatted: this.formatDate(date)
            };
        }
        
        // Try parsing different formats
        const formats = [
            'DD-MM-YY HH:mm:ss',
            'YYYY-MM-DD HH:mm:ss',
            'MM/DD/YYYY HH:mm:ss'
        ];
        
        for (const format of formats) {
            // Add your preferred date parsing logic here
            // This is a simplified example
            const parsed = new Date(dateStr.replace(/-/g, '/'));
            if (!isNaN(parsed.getTime())) {
                return {
                    valid: true,
                    date: parsed,
                    formatted: this.formatDate(parsed)
                };
            }
        }
        
        return {
            valid: false,
            originalString: dateStr
        };
    }

    formatDate(date) {
        return date.toISOString().replace('T', ' ').substr(0, 19);
    }

    hasDataIssues(trade) {
        return !this.parseDate(trade.date).valid || 
               !trade.orderId || 
               trade.totalFees === 0;
    }

    updateDateFormat(format) {
        this.dateFormat = format;
        this.analyzePair(document.getElementById('pairSelect').value);
    }

    toggleAllTrades() {
        const trades = document.querySelectorAll('.trade-item');
        trades.forEach(trade => trade.classList.toggle('expanded'));
    }

    updateDateParsingStatus() {
        if (this.debugMode) {
            console.log('Date Parsing Statistics:', {
                total: this.dateParsingStats.totalProcessed,
                successful: this.dateParsingStats.successfullyParsed,
                errorRate: `${((this.dateParsingStats.errors.length / this.dateParsingStats.totalProcessed) * 100).toFixed(2)}%`,
                formatDistribution: this.dateParsingStats.formatCounts,
                errors: this.dateParsingStats.errors
            });
        }
    }

    togglePairingMode() {
        this.pairingMode = !this.pairingMode;
        document.getElementById('togglePairingMode').classList.toggle('active');
        document.getElementById('pairingControls').classList.toggle('visible');
        this.selectedTrades.clear();
        this.analyzePair(document.getElementById('pairSelect').value);
    }

    toggleTradeSelection(trade) {
        if (!trade || !trade.orderId) {
            console.warn('Invalid trade object or missing orderId:', trade);
            return;
        }

        console.log('Toggling trade selection for orderId:', trade.orderId); // Debug log
        
        if (this.selectedTrades.has(trade.orderId)) {
            console.log('Removing trade from selection');
            this.selectedTrades.delete(trade.orderId);
        } else {
            console.log('Adding trade to selection');
            this.selectedTrades.add(trade.orderId);
        }
        
        console.log('Current selected trades:', Array.from(this.selectedTrades)); // Debug log
        this.updatePairingUI();
    }

    createTradePair() {
        if (this.selectedTrades.size < 2) {
            console.warn('Need at least 2 trades to create a pair');
            return;
        }

        // Validate that all selected trades exist
        const selectedTradeData = Array.from(this.selectedTrades)
            .map(orderId => {
                const trade = this.trades.get(orderId);
                if (!trade) {
                    console.warn('Could not find trade with orderId:', orderId);
                }
                return trade;
            })
            .filter(trade => trade !== undefined);

        if (selectedTradeData.length < 2) {
            console.warn('Not enough valid trades to create a pair');
            alert('Could not create pair: Some selected trades are invalid');
            return;
        }

        // Sort trades by date
        selectedTradeData.sort((a, b) => new Date(a.date) - new Date(b.date));

        const pairId = `pair_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const pairName = this.generatePairName(selectedTradeData);
        const pairAnalysis = this.analyzeTradePair(selectedTradeData);
        
        this.tradePairs.set(pairId, {
            id: pairId,
            name: pairName,
            trades: Array.from(this.selectedTrades),
            analysis: pairAnalysis,
            createdAt: new Date().toISOString()
        });

        console.log('Created trade pair:', {
            id: pairId,
            name: pairName,
            trades: Array.from(this.selectedTrades),
            analysis: pairAnalysis
        });

        this.selectedTrades.clear();
        this.filterPairedTrades(document.getElementById('pairFilter').value);
        this.renderTradeCycles();
        
        // Show save button after creating new pair
        this.showSaveButton();
    }

    analyzeTradePair(trades) {
        let entryValue = 0;
        let exitValue = 0;
        let totalFees = 0;
        let totalSize = 0;

        trades.forEach(trade => {
            if (trade.totalAmount > 0) { // Entry
                entryValue += trade.totalValue;
                totalSize += trade.totalAmount;
            } else { // Exit
                exitValue += Math.abs(trade.totalValue);
            }
            totalFees += trade.totalFees;
        });

        const holdDuration = new Date(trades[trades.length - 1].date) - new Date(trades[0].date);
        const pnl = exitValue - entryValue - totalFees;
        const roi = (pnl / entryValue) * 100;

        return {
            entryPrice: entryValue / totalSize,
            exitPrice: exitValue / totalSize,
            holdDuration,
            positionSize: totalSize,
            pnl,
            roi,
            totalFees
        };
    }

    generatePairName(trades) {
        const pair = trades[0].pair.split('/')[0];
        const date = new Date(trades[0].date).toLocaleDateString();
        const existingPairs = Array.from(this.tradePairs.values())
            .filter(p => p.name.includes(`${pair} Trade`)).length;
        return `${pair} Trade #${existingPairs + 1} (${date})`;
    }

    updatePairsSummary() {
        const pairs = Array.from(this.tradePairs.values());
        const summary = {
            totalPairs: pairs.length,
            avgHoldTime: pairs.reduce((acc, p) => acc + p.analysis.holdDuration, 0) / pairs.length,
            avgRoi: pairs.reduce((acc, p) => acc + p.analysis.roi, 0) / pairs.length,
            bestPair: pairs.reduce((best, curr) => curr.analysis.roi > best.analysis.roi ? curr : best, pairs[0]),
            worstPair: pairs.reduce((worst, curr) => curr.analysis.roi < worst.analysis.roi ? curr : worst, pairs[0])
        };

        document.getElementById('pairsSummary').innerHTML = this.renderPairsSummary(summary);
    }

    renderPairsSummary(summary) {
        return `
            <div class="pairs-summary-grid">
                <div class="summary-item">
                    <div class="summary-label">Total Pairs</div>
                    <div class="summary-value">${summary.totalPairs}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Avg Hold Time</div>
                    <div class="summary-value">${this.formatDuration(summary.avgHoldTime)}</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Avg ROI</div>
                    <div class="summary-value">${summary.avgRoi.toFixed(2)}%</div>
                </div>
                <div class="summary-item">
                    <div class="summary-label">Best Trade</div>
                    <div class="summary-value">${summary.bestPair.name} (${summary.bestPair.analysis.roi.toFixed(2)}%)</div>
                </div>
            </div>
        `;
    }

    formatDuration(ms) {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
    }

    exportPairsAnalysis() {
        console.log('Exporting pairs analysis...'); // Debug log
        const cycles = this.analyzeTradeCycles();
        
        if (cycles.length === 0) {
            console.warn('No trade cycles to export');
            alert('No trade cycles available to export');
            return;
        }

        try {
            const csv = [
                ['Cycle Name', 'Entry Date', 'Exit Date', 'Hold Duration', 'Position Size', 
                 'Entry Price', 'Exit Price', 'Price Change %', 'ROI %', 'P&L', 'Total Fees'],
                ...cycles.map(cycle => [
                    cycle.name,
                    this.formatDate(cycle.entryDate),
                    this.formatDate(cycle.exitDate),
                    this.formatDuration(cycle.holdDuration),
                    cycle.positionSize.toFixed(8),
                    cycle.entryPrice.toFixed(2),
                    cycle.exitPrice.toFixed(2),
                    ((cycle.exitPrice - cycle.entryPrice) / cycle.entryPrice * 100).toFixed(2) + '%',
                    cycle.roi.toFixed(2) + '%',
                    cycle.pnl.toFixed(2),
                    cycle.totalFees.toFixed(2)
                ])
            ].map(row => row.join(',')).join('\n');

            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'trade-cycles-analysis.csv';
            document.body.appendChild(a); // Add to document
            a.click();
            document.body.removeChild(a); // Clean up
            URL.revokeObjectURL(url);
            
            console.log('Export completed successfully');
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export trade cycles. See console for details.');
        }
    }

    findTradePair(orderId) {
        for (const [pairId, pairInfo] of this.tradePairs) {
            if (pairInfo.trades.includes(orderId)) {
                return {
                    pairId,
                    name: pairInfo.name
                };
            }
        }
        return null;
    }

    updatePairingUI() {
        console.log('Updating pairing UI, selected trades:', Array.from(this.selectedTrades));
        
        const confirmPairButton = document.getElementById('confirmPair');
        if (confirmPairButton) {
            confirmPairButton.disabled = this.selectedTrades.size < 2;
        }

        // Update only the checkboxes that need to be updated
        document.querySelectorAll('.trade-item').forEach(tradeItem => {
            const orderId = tradeItem.dataset.orderId;
            const checkbox = tradeItem.querySelector('.pair-checkbox');
            if (checkbox && orderId) {
                checkbox.checked = this.selectedTrades.has(orderId);
            }
        });
    }

    filterPairedTrades(filter) {
        const currentPair = document.getElementById('pairSelect').value;
        if (!currentPair) return;

        console.log('Filtering trades:', filter); // Debug log

        const trades = Array.from(this.trades.values())
            .filter(trade => trade.pair === currentPair);

        const filtered = trades.filter(trade => {
            const isPaired = this.findTradePair(trade.orderId) !== null;
            switch(filter) {
                case 'paired':
                    return isPaired;
                case 'unpaired':
                    return !isPaired;
                default:
                    return true;
            }
        });

        console.log(`Filtered ${trades.length} trades to ${filtered.length} trades`); // Debug log

        this.updateMetrics(filtered);
        this.renderTradesList(filtered);
    }

    initializeCharts() {
        // Initialize Chart.js charts
        this.charts = {
            roiDist: this.createROIDistributionChart(),
            holdTimeRoi: this.createHoldTimeROIChart(),
            performance: this.createPerformanceHeatmap()
        };
    }

    createROIDistributionChart() {
        const ctx = document.getElementById('roiDistributionChart').getContext('2d');
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: [],
                datasets: [{
                    label: 'ROI Distribution',
                    data: [],
                    backgroundColor: 'rgba(26, 115, 232, 0.5)',
                    borderColor: 'rgba(26, 115, 232, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Number of Trades'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'ROI %'
                        }
                    }
                }
            }
        });
    }

    createHoldTimeROIChart() {
        const ctx = document.getElementById('holdTimeRoiChart').getContext('2d');
        return new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Trades',
                    data: [],
                    backgroundColor: (context) => {
                        const value = context.raw?.y || 0;
                        return value >= 0 ? 'rgba(19, 115, 51, 0.5)' : 'rgba(165, 14, 14, 0.5)';
                    }
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: 'ROI %'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Hold Time (hours)'
                        }
                    }
                }
            }
        });
    }

    createPerformanceHeatmap() {
        const container = document.getElementById('performanceHeatmap');
        // Clear existing content
        container.innerHTML = '';
        
        // Create heatmap grid
        const grid = document.createElement('div');
        grid.className = 'heatmap-grid';
        container.appendChild(grid);
        
        return grid;
    }

    updateVisualizationCharts(cycles) {
        this.updateROIDistribution(cycles);
        this.updateHoldTimeROI(cycles);
        this.updatePerformanceHeatmap(cycles);
    }

    updateROIDistribution(cycles) {
        const rois = cycles.map(cycle => cycle.roi);
        const binSize = 5; // 5% intervals
        const bins = {};
        
        rois.forEach(roi => {
            const binIndex = Math.floor(roi / binSize) * binSize;
            bins[binIndex] = (bins[binIndex] || 0) + 1;
        });

        const sortedBins = Object.entries(bins).sort(([a], [b]) => Number(a) - Number(b));

        this.charts.roiDist.data.labels = sortedBins.map(([bin]) => `${bin}% to ${Number(bin) + binSize}%`);
        this.charts.roiDist.data.datasets[0].data = sortedBins.map(([, count]) => count);
        this.charts.roiDist.update();
    }

    updateHoldTimeROI(cycles) {
        this.charts.holdTimeRoi.data.datasets[0].data = cycles.map(cycle => ({
            x: cycle.holdDuration / (1000 * 60 * 60), // Convert to hours
            y: cycle.roi
        }));
        this.charts.holdTimeRoi.update();
    }

    updatePerformanceHeatmap(cycles) {
        const grid = this.charts.performance;
        grid.innerHTML = '';

        // Group trades by month and calculate performance
        const monthlyPerformance = {};
        cycles.forEach(cycle => {
            const month = new Date(cycle.entryDate).toISOString().slice(0, 7);
            if (!monthlyPerformance[month]) {
                monthlyPerformance[month] = {
                    totalROI: 0,
                    count: 0
                };
            }
            monthlyPerformance[month].totalROI += cycle.roi;
            monthlyPerformance[month].count++;
        });

        // Create heatmap cells
        Object.entries(monthlyPerformance).forEach(([month, data]) => {
            const avgROI = data.totalROI / data.count;
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            cell.style.backgroundColor = this.getHeatmapColor(avgROI);
            cell.setAttribute('data-tooltip', `${month}: ${avgROI.toFixed(2)}% (${data.count} trades)`);
            grid.appendChild(cell);
        });
    }

    getHeatmapColor(roi) {
        if (roi >= 0) {
            const intensity = Math.min(roi / 20, 1); // Max intensity at 20% ROI
            return `rgba(19, 115, 51, ${intensity})`;
        } else {
            const intensity = Math.min(Math.abs(roi) / 20, 1);
            return `rgba(165, 14, 14, ${intensity})`;
        }
    }

    updateCycleSummaryMetrics(cycles) {
        if (cycles.length === 0) return;

        const summary = {
            totalCycles: cycles.length,
            avgHoldTime: cycles.reduce((acc, c) => acc + c.holdDuration, 0) / cycles.length,
            profitableTrades: cycles.filter(c => c.roi > 0).length,
            bestTrade: cycles.reduce((best, curr) => curr.roi > best.roi ? curr : best, cycles[0]),
            worstTrade: cycles.reduce((worst, curr) => curr.roi < worst.roi ? curr : worst, cycles[0]),
            avgRoi: cycles.reduce((acc, c) => acc + c.roi, 0) / cycles.length
        };

        // Update summary metrics in the UI with null checks
        const elements = {
            totalCycles: document.getElementById('totalCycles'),
            avgHoldTime: document.getElementById('avgHoldTime'),
            successRate: document.getElementById('successRate'),
            avgRoi: document.getElementById('avgRoi')
        };

        if (elements.totalCycles) {
            elements.totalCycles.textContent = summary.totalCycles;
        }

        if (elements.avgHoldTime) {
            elements.avgHoldTime.textContent = this.formatDuration(summary.avgHoldTime);
        }

        if (elements.successRate) {
            const successRate = (summary.profitableTrades / summary.totalCycles) * 100;
            elements.successRate.textContent = `${successRate.toFixed(1)}%`;
        }

        if (elements.avgRoi) {
            elements.avgRoi.textContent = `${summary.avgRoi.toFixed(2)}%`;
        }

        // Log summary for debugging
        console.log('Cycle Summary:', summary);
    }

    createCycleChart(cycle) {
        console.log('Creating chart for cycle:', cycle); // Debug log
        
        const chartId = `cycleChart_${cycle.id}`;
        const ctx = document.getElementById(chartId).getContext('2d');
        
        // Create price data points from trades
        const dataPoints = [];
        
        // Safely process each trade
        cycle.trades.forEach(tradeId => {
            const tradeData = this.trades.get(tradeId);
            if (tradeData) {
                // For each sub-transaction in the trade
                tradeData.trades.forEach(subTrade => {
                    dataPoints.push({
                        x: new Date(tradeData.date).getTime(),
                        y: Math.abs(subTrade.price) // Use the actual price from sub-transaction
                    });
                });
            }
        });

        // Sort data points by time
        dataPoints.sort((a, b) => a.x - b.x);

        console.log('Chart data points:', dataPoints); // Debug log

        new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Price',
                    data: dataPoints,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour',
                            displayFormats: {
                                hour: 'MMM D, HH:mm'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Price (USD)'
                        },
                        beginAtZero: false
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Price: $${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: `Price Chart for ${cycle.name}`
                    }
                }
            }
        });
    }

    filterCycles(timeRange) {
        const cycles = this.analyzeTradeCycles();
        const now = new Date();
        
        const filtered = cycles.filter(cycle => {
            const cycleDate = new Date(cycle.entryDate);
            switch(timeRange) {
                case 'month':
                    return (now - cycleDate) <= 30 * 24 * 60 * 60 * 1000;
                case 'quarter':
                    return (now - cycleDate) <= 90 * 24 * 60 * 60 * 1000;
                case 'year':
                    return cycleDate.getFullYear() === now.getFullYear();
                default:
                    return true;
            }
        });

        this.renderCyclesTable(filtered);
        this.updateVisualizationCharts(filtered);
    }

    async savePairs() {
        try {
            // Prepare new pairs data
            const newPairs = {};
            this.tradePairs.forEach((pair, pairId) => {
                newPairs[pairId] = {
                    name: pair.name,
                    orderIDs: pair.trades,
                    analysis: pair.analysis,
                    createdAt: new Date().toISOString()
                };
            });

            try {
                // First, let user select the directory
                const dirHandle = await window.showDirectoryPicker({
                    mode: 'readwrite'
                });

                // Navigate to or create 'pairs' subdirectory
                let pairsDir;
                try {
                    pairsDir = await dirHandle.getDirectoryHandle('pairs', { create: true });
                } catch (e) {
                    console.warn('Could not create pairs directory, saving in root');
                    pairsDir = dirHandle;
                }

                // Try to read existing file first
                let existingPairs = {};
                try {
                    const fileHandle = await pairsDir.getFileHandle('trade_pairs.json');
                    const file = await fileHandle.getFile();
                    const content = await file.text();
                    existingPairs = JSON.parse(content);
                    console.log('Found existing pairs:', Object.keys(existingPairs).length);
                } catch (e) {
                    console.log('No existing pairs file found, creating new one');
                }

                // Merge pairs, handling conflicts
                const mergedPairs = this.mergePairs(existingPairs, newPairs);
                console.log('Merged pairs:', Object.keys(mergedPairs).length);

                // Save merged pairs
                const fileHandle = await pairsDir.getFileHandle('trade_pairs.json', { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(mergedPairs, null, 2));
                await writable.close();

                console.log('Successfully saved merged pairs file');
                alert('Pairs saved successfully!');

            } catch (error) {
                console.warn('File System Access API failed, falling back to download:', error);
                this.downloadPairsFile(newPairs);
            }

        } catch (error) {
            console.error('Error saving pairs:', error);
            alert('Error saving pairs. Check console for details.');
        }
    }

    // Add this new method to handle pair merging
    mergePairs(existing, newPairs) {
        const merged = { ...existing };
        const usedOrderIds = new Set();
        const removedPairs = new Set();

        // First, collect all order IDs from new pairs
        Object.values(newPairs).forEach(pair => {
            pair.orderIDs.forEach(orderId => usedOrderIds.add(orderId));
        });

        // Remove existing pairs that have conflicting order IDs
        Object.entries(merged).forEach(([pairId, pair]) => {
            const hasConflict = pair.orderIDs.some(orderId => usedOrderIds.has(orderId));
            if (hasConflict) {
                console.log(`Removing conflicting pair ${pairId} with orders:`, pair.orderIDs);
                delete merged[pairId];
                removedPairs.add(pairId);
            }
        });

        // Add all new pairs
        Object.entries(newPairs).forEach(([pairId, pair]) => {
            merged[pairId] = pair;
        });

        // Log summary of changes
        console.log('Merge summary:', {
            existingPairs: Object.keys(existing).length,
            newPairs: Object.keys(newPairs).length,
            removedPairs: removedPairs.size,
            finalPairs: Object.keys(merged).length
        });

        return merged;
    }

    async loadSavedPairs() {
        try {
            // Create a file input for loading the pairs file
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            // Create a promise to handle the file selection
            const fileSelected = new Promise((resolve) => {
                input.onchange = (e) => resolve(e.target.files[0]);
            });

            // Trigger file selection
            input.click();

            // Wait for file selection
            const file = await fileSelected;
            if (!file) return;

            // Read the file
            const content = await file.text();
            const savedPairs = JSON.parse(content);

            // Clear existing pairs
            this.tradePairs.clear();

            // Restore saved pairs
            Object.entries(savedPairs).forEach(([pairId, pairData]) => {
                this.tradePairs.set(pairId, {
                    id: pairId,
                    name: pairData.name,
                    trades: pairData.orderIDs || pairData.trades,
                    analysis: pairData.analysis || {}
                });
            });

            console.log('Loaded saved pairs:', this.tradePairs);
            this.renderTradeCycles();
            alert('Pairs loaded successfully!');

        } catch (error) {
            console.warn('Error loading saved pairs:', error);
            alert('Error loading pairs file. Make sure it\'s a valid JSON file.');
        }
    }

    downloadPairsFile(pairs) {
        try {
            const blob = new Blob([JSON.stringify(pairs, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'trade_pairs.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('Pairs file downloaded successfully');
        } catch (error) {
            console.error('Error downloading pairs file:', error);
            alert('Error downloading pairs file. Check console for details.');
        }
    }

    showSaveButton() {
        const saveButton = document.getElementById('savePairs') || this.createSaveButton();
        saveButton.style.display = 'inline-block';
    }

    createSaveButton() {
        const button = document.createElement('button');
        button.id = 'savePairs';
        button.className = 'btn save-pairs-btn';
        button.innerHTML = '<i class="fas fa-save"></i> Save Pairs';
        button.addEventListener('click', () => this.savePairs());
        
        // Add to pairing controls
        const pairingHeader = document.querySelector('.pairing-header');
        pairingHeader.appendChild(button);
        
        return button;
    }

    initializePairsFileInput() {
        // Create a file input for loading the pairs file
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        input.id = 'pairsFileInput';
        
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const content = await file.text();
                    const savedPairs = JSON.parse(content);
                    
                    // Clear existing pairs
                    this.tradePairs.clear();
                    
                    // Restore saved pairs
                    Object.entries(savedPairs).forEach(([pairId, pairData]) => {
                        this.tradePairs.set(pairId, {
                            id: pairId,
                            name: pairData.name,
                            trades: pairData.orderIDs || pairData.trades,
                            analysis: pairData.analysis || {}
                        });
                    });
                    
                    console.log('Loaded saved pairs:', this.tradePairs);
                    this.renderTradeCycles();
                    alert('Pairs loaded successfully!');
                } catch (error) {
                    console.error('Error loading pairs file:', error);
                    alert('Error loading pairs file. Make sure it\'s a valid JSON file.');
                }
            }
        });
        
        document.body.appendChild(input);
        this.pairsFileInput = input;
    }

    initializeQuoteCurrencies() {
        this.quoteCurrencies = new Set();
        this.tradingPairsByQuote = new Map();
    }

    detectQuoteCurrencies() {
        this.quoteCurrencies.clear();
        this.tradingPairsByQuote.clear();

        // Extract quote currencies from trading pairs
        this.tradingPairs.forEach(pair => {
            const [base, quote] = pair.split('/');
            if (quote) {
                this.quoteCurrencies.add(quote);
                
                // Group trading pairs by quote currency
                if (!this.tradingPairsByQuote.has(quote)) {
                    this.tradingPairsByQuote.set(quote, new Set());
                }
                this.tradingPairsByQuote.get(quote).add(pair);
            }
        });

        this.updateQuoteCurrencySelect();
    }

    updateQuoteCurrencySelect() {
        const select = document.createElement('select');
        select.id = 'quoteCurrencySelect';
        select.className = 'quote-currency-select';
        
        select.innerHTML = '<option value="">All Quote Currencies</option>' +
            Array.from(this.quoteCurrencies)
                .sort()
                .map(quote => `<option value="${quote}">${quote}</option>`)
                .join('');

        select.addEventListener('change', (e) => this.handleQuoteCurrencyChange(e.target.value));

        // Replace or add the select element
        const existingSelect = document.getElementById('quoteCurrencySelect');
        if (existingSelect) {
            existingSelect.replaceWith(select);
        } else {
            const cycleFilters = document.querySelector('.cycle-filters');
            if (cycleFilters) {
                cycleFilters.insertBefore(select, cycleFilters.firstChild);
            }
        }
    }

    handleQuoteCurrencyChange(quoteCurrency) {
        // Update trading pairs select based on quote currency
        const pairSelect = document.getElementById('pairSelect');
        pairSelect.innerHTML = '<option value="">Select Trading Pair</option>';

        if (quoteCurrency && this.tradingPairsByQuote.has(quoteCurrency)) {
            Array.from(this.tradingPairsByQuote.get(quoteCurrency))
                .sort()
                .forEach(pair => {
                    const option = document.createElement('option');
                    option.value = pair;
                    option.textContent = pair;
                    pairSelect.appendChild(option);
                });
        }

        // Update the cycles table with filtered data
        const cycles = this.analyzeTradeCycles(quoteCurrency);
        this.renderCyclesTable(cycles);
        this.updateVisualizationCharts(cycles);
        this.updateCycleSummaryMetrics(cycles);
    }

    updateQuoteCurrencyMetrics(quoteCurrency) {
        if (!quoteCurrency) return;

        // Get all trades for the selected quote currency
        const quoteTrades = Array.from(this.trades.values())
            .filter(trade => trade.pair.endsWith('/' + quoteCurrency));

        let totalVolume = 0;
        let totalPnL = 0;
        let tradeCount = 0;

        quoteTrades.forEach(trade => {
            totalVolume += Math.abs(trade.totalValue);
            // PnL calculation will depend on whether it's a buy or sell
            if (trade.totalAmount < 0) { // Sell
                totalPnL += trade.totalValue;
            } else { // Buy
                totalPnL -= trade.totalValue;
            }
            tradeCount++;
        });

        // Update the metrics display
        this.updateMetricCard('volumeCard', `${totalVolume.toFixed(2)} ${quoteCurrency}`);
        this.updateMetricCard('pnlCard', `${totalPnL.toFixed(2)} ${quoteCurrency}`);
        
        // Add a new metric for trade count if needed
        const tradeCountElement = document.getElementById('tradeCount');
        if (tradeCountElement) {
            tradeCountElement.textContent = tradeCount;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new TradeAnalyzer();
}); 