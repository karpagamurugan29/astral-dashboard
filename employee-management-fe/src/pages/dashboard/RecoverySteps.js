import React from 'react'

// Left-panel content for forgot / reset password: where you are in getting back in.
const STEPS = [
    ['mdi-email-send-outline', 'Enter your work email', 'We send a one-time code to it.'],
    ['mdi-shield-key-outline', 'Enter the code', 'It expires after a few minutes.'],
    ['mdi-lock-reset', 'Choose a new password', 'Then sign in as usual.'],
]

export const RecoverySteps = ({ current }) => (
    <div className="lg-welcome">
        <span className="lg-eyebrow"><i className="mdi mdi-lifebuoy"></i>Account recovery</span>
        <h1>Locked out?<br /><em>Let’s get you back in.</em></h1>
        <ol className="lg-steps">
            {STEPS.map(([icon, title, text], i) => (
                <li key={title} className={i < current ? 'done' : i === current ? 'now' : ''} style={{ '--d': `${0.3 + i * 0.1}s` }}>
                    <span className="lg-step-ic"><i className={`mdi ${i < current ? 'mdi-check' : icon}`}></i></span>
                    <span><b>{title}</b><small>{text}</small></span>
                </li>
            ))}
        </ol>
    </div>
)
