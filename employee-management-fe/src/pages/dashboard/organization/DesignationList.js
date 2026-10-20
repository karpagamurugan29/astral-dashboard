import React from 'react'
import designationActions from '../../../redux/designation/Actions'
import { OrgUnitList } from '../../../components/people/OrgUnitList'

const config = {
    reducer: 'designationReducer',
    actions: {
        GET: designationActions.GET_DESIGNATIONS,
        ADD: designationActions.ADD_DESIGNATION,
        UPDATE: designationActions.UPDATE_DESIGNATION,
        DELETE: designationActions.DELETE_DESIGNATION,
    },
    title: 'Designations',
    singular: 'Designation',
    subtitle: 'Job titles used across the company, and how many people hold each.',
    icon: 'mdi-badge-account-horizontal-outline',
    color: '#8b5cf6',
    employeeField: 'designation',
    secondField: 'department',
    needsDepartments: true,
    namePlaceholder: 'e.g. Senior Software Engineer',
    emptyText: 'Add job titles so new employees can be assigned one.',
    blank: { name: '', department: '', description: '' },
    toForm: (d) => ({ name: d.name, department: d.department, description: d.description }),
}

export const DesignationList = () => <OrgUnitList config={config} />
