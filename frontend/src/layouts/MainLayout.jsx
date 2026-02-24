import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

const MainLayout = () => {
    return (
        <div className="min-h-screen bg-[#0f0f0f]">
            <Sidebar />
            <main className="pl-64 min-h-screen">
                <div className="max-w-7xl mx-auto p-6 md:p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default MainLayout;
