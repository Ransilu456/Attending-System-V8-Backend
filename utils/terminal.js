const icons = {
    info: '🔹',
    success: '✨',
    warning: '⚠️',
    error: '❌',
    database: '🗃️',
    server: '🚀',
    config: '⚙️',
    time: '🕒',
    user: '👤',
    security: '🔒',
    api: '🔌',
    web: '🌐',
    report: '📊',
    attendance: '📋',
    qr: '��',
    message: '💬',
    network: '🌍',
    firewall: '🛡️',
    connection: '🔗',
    loading: '⏳',
    check: '✅',
    cross: '❌',
    arrow: '➜',
    star: '⭐',
    lock: '🔐',
    key: '🔑',
    bell: '🔔',
    clock: '⏰',
    calendar: '📅',
    file: '📄',
    folder: '📁',
    search: '🔍',
    settings: '⚙️',
    power: '🔌',
    refresh: '🔄',
    download: '⬇️',
    upload: '⬆️',
    trash: '🗑️',
    edit: '✏️',
    plus: '➕',
    minus: '➖',
    question: '❓',
    exclamation: '❗',
    heart: '❤️',
    sparkles: '✨',
    rocket: '🚀',
    gear: '⚙️',
    shield: '🛡️',
    bug: '🐛',
    fix: '🔧',
    test: '🧪',
    deploy: '🚀',
    monitor: '📺',
    terminal: '💻'
};

const spinners = {};

export const printBanner = () => {
    console.clear();
    
    const border = '═'.repeat(process.stdout.columns || 80);
    console.log(border);

    // ASCII Art Banner
    console.log(`
    ██████╗ ██████╗     █████╗ ████████╗████████╗███████╗███╗   ██╗██████╗ ███████╗███╗   ██╗ ██████╗███████╗
    ██╔══██╗██╔══██╗   ██╔══██╗╚══██╔══╝╚══██╔══╝██╔════╝████╗  ██║██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝
    ██████╔╝██████╔╝   ███████║   ██║      ██║   █████╗  ██╔██╗ ██║██║  ██║█████╗  ██╔██╗ ██║██║     █████╗  
    ██╔══██╗██╔══██╗   ██╔══██║   ██║      ██║   ██╔══╝  ██║╚██╗██║██║  ██║██╔══╝  ██║╚██╗██║██║     ██╔══╝  
    ██║  ██║██║  ██║   ██║  ██║   ██║      ██║   ███████╗██║ ╚████║██████╔╝███████╗██║ ╚████║╚██████╗███████╗
    ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝  ╚═╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═══╝ ╚═════╝╚══════╝
    `);

    console.log('╔' + '═'.repeat((process.stdout.columns || 80) - 2) + '╗');
    const subtitle = 'Smart Attendance Management System';
    const version = 'v5.0.0';
    const padding = Math.floor(((process.stdout.columns || 80) - subtitle.length - version.length - 4) / 2);
    console.log(
        '║' + ' '.repeat(padding) + 
        subtitle + ' ' + version + 
        ' '.repeat((process.stdout.columns || 80) - subtitle.length - version.length - padding - 4) + 
        '║'
    );
    console.log('╚' + '═'.repeat((process.stdout.columns || 80) - 2) + '╝');
};

export const logInfo = (message) => {
    console.log(icons.info + ' ' + message);
};

export const logSuccess = (message) => {
    console.log(icons.success + ' ' + message);
};

export const logWarning = (message) => {
    console.log(icons.warning + ' ' + message);
};

export const logError = (message, error = null) => {
    console.log('\n' + icons.error + ' ' + message);
    if (error && error.stack) {
        console.log('  Stack Trace:');
        console.log(error.stack);
    }
    console.log();
};

export const logReport = (message) => {
    console.log(icons.report + ' ' + message);
};

export const logAttendance = (message) => {
    console.log(icons.attendance + ' ' + message);
};

export const logQR = (message) => {
    console.log(icons.qr + ' ' + message);
};

export const logMessage = (message) => {
    console.log(icons.message + ' ' + message);
};

export const logSection = (title, icon = '') => {
    const sectionIcon = icons[title.toLowerCase()] || icon || '📌';
    const cols = process.stdout.columns || 80;
    console.log('\n' + '┌─' + sectionIcon + '─' + '─'.repeat(cols - 6) + '┐');
    console.log('│ ' + title + 
                ' '.repeat(cols - title.length - 4) + 
                ' │');
    console.log('└' + '─'.repeat(cols - 2) + '┘');
};

export const logServerStart = (port) => {
    const message = `Server running on port ${port}`;
    const timestamp = new Date().toLocaleTimeString();
    const cols = process.stdout.columns || 80;
    
    console.log('\n' + '┌' + '─'.repeat(cols - 2) + '┐');
    console.log('│' + ' '.repeat((cols - message.length - 2) / 2) + 
                message + 
                ' '.repeat((cols - message.length - 2) / 2) + 
                '│');
    console.log('│' + ' '.repeat((cols - timestamp.length - 2) / 2) + 
                timestamp + 
                ' '.repeat((cols - timestamp.length - 2) / 2) + 
                '│');
    console.log('└' + '─'.repeat(cols - 2) + '┘\n');
    
    logInfo('System is configured to count weekends in attendance reports');
};

// Enhanced spinner with progress
export const startSpinner = (id, text) => {
    if (spinners[id]) {
        stopSpinner(id);
    }
    spinners[id] = {
        text,
        startTime: Date.now(),
        progress: 0
    };
    process.stdout.write(text + '...');
    return spinners[id];
};

export const updateSpinner = (id, text, progress = null) => {
    if (spinners[id]) {
        spinners[id].text = text;
        if (progress !== null) {
            spinners[id].progress = progress;
        }
        const progressBar = progress !== null ? ` [${Math.floor(progress * 100)}%]` : '';
        process.stdout.write('\r' + text + progressBar + '...');
    }
};

export const succeedSpinner = (id, text) => {
    if (spinners[id]) {
        const timeTaken = Date.now() - spinners[id].startTime;
        process.stdout.write('\r' + (text || spinners[id].text) + ' ✓ (' + timeTaken + 'ms)\n');
        delete spinners[id];
    }
};

export const failSpinner = (id, text) => {
    if (spinners[id]) {
        const timeTaken = Date.now() - spinners[id].startTime;
        process.stdout.write('\r' + (text || spinners[id].text) + ' ✗ (' + timeTaken + 'ms)\n');
        delete spinners[id];
    }
};

export const stopSpinner = (id) => {
    if (spinners[id]) {
        process.stdout.write('\n');
        delete spinners[id];
    }
};

// New utility functions
export const logProgress = (current, total, message = 'Progress') => {
    const progress = current / total;
    const barLength = 30;
    const filledLength = Math.round(barLength * progress);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
    const percentage = Math.round(progress * 100);
    process.stdout.write(`\r${message}: [${bar}] ${percentage}%`);
    if (current === total) {
        process.stdout.write('\n');
    }
};

export const logBox = (title, content) => {
    const cols = process.stdout.columns || 80;
    const padding = 2;
    const width = cols - (padding * 2);
    
    console.log('\n' + '┌' + '─'.repeat(width) + '┐');
    console.log('│' + ' '.repeat(padding) + title + ' '.repeat(width - title.length - (padding * 2)) + '│');
    console.log('├' + '─'.repeat(width) + '┤');
    
    const lines = content.split('\n');
    lines.forEach(line => {
        const paddedLine = line.padEnd(width - (padding * 2));
        console.log('│' + ' '.repeat(padding) + paddedLine + ' '.repeat(padding) + '│');
    });
    
    console.log('└' + '─'.repeat(width) + '┘\n');
};

export const logTable = (data, heading = '') => {
    if (!data || !data.length) {
        logWarning('No data to display in table');
        return;
    }
    
    if (heading) {
        logBox(heading, '');
    }
    
    console.table(data);
};

export const logTimeTaken = (operation, startTime) => {
    const timeTaken = Date.now() - startTime;
    const formattedTime = timeTaken < 1000 ? 
        `${timeTaken}ms` : 
        `${(timeTaken / 1000).toFixed(2)}s`;
    console.log(icons.time + ' ' + `${operation}: ${formattedTime}`);
};

export const formatObject = (obj) => {
    return JSON.stringify(obj, null, 2);
};

export const getIcons = () => icons;

export const logNetwork = (message) => {
    console.log(icons.network + ' ' + message);
};

export const logSecurity = (message) => {
    console.log(icons.security + ' ' + message);
};

export const logConnection = (message) => {
    console.log(icons.connection + ' ' + message);
};

export const logDeploy = (message) => {
    console.log(icons.deploy + ' ' + message);
};

export const logMonitor = (message) => {
    console.log(icons.monitor + ' ' + message);
};

export const logTerminal = (message) => {
    console.log(icons.terminal + ' ' + message);
};

// Export all functions
export default {
    printBanner,
    logInfo,
    logSuccess,
    logWarning,
    logError,
    logNetwork,
    logSecurity,
    logConnection,
    logDeploy,
    logMonitor,
    logTerminal,
    logProgress,
    logBox,
    logTable,
    logTimeTaken,
    formatObject,
    startSpinner,
    updateSpinner,
    succeedSpinner,
    failSpinner,
    stopSpinner,
    getIcons
};
