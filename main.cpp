#include <windows.h>
#include <iostream>
#include <string>

int main() {
    STARTUPINFOA si = { sizeof(si) };
    PROCESS_INFORMATION pi;


    std::string scriptPath = "\"D:\\System\\Both\\backend\\server.js\"";
    std::string command = "node " + scriptPath;

    BOOL success = CreateProcessA(
        NULL,
        &command[0],
        NULL,
        NULL,
        FALSE,
        0,
        NULL,
        NULL,
        &si,
        &pi
    );

    if (!success) {
        std::cerr << "Failed to start Node.js backend. Error: " << GetLastError() << '\n';
        return 1;
    }

    std::cout << "Node.js server is running. Press ENTER to stop it..." << std::endl;
    std::cin.get();

    TerminateProcess(pi.hProcess, 0);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);

    std::cout << "Node.js server stopped." << std::endl;
    return 0;
}
