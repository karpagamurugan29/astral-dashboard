import React from 'react'
import { Sidebar } from './Sidebar'
import { TopHeader } from './TopHeader'
import { BottomNav } from './BottomNav'
import { ReminderPopup } from '../../reminders/ReminderPopup'

export const DashNav = ({ children }) => {
    return (
        <div id="layout-wrapper">
            <TopHeader />
            <div className='dash-body'>
                <div className='dash-body-left'>
                    <Sidebar />
                </div>
                <div className='dash-body-right'>
                    {children}
                </div>
            </div>
            <BottomNav />
            <ReminderPopup />
        </div>
    )
}
