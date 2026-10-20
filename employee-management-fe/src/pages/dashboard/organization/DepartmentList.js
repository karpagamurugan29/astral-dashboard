import React from 'react'
import departmentActions from '../../../redux/department/Actions'
import { OrgUnitList } from '../../../components/people/OrgUnitList'

const config = {
    reducer: 'departmentReducer',
    actions: {
        GET: departmentActions.GET_DEPARTMENTS,
        ADD: departmentActions.ADD_DEPARTMENT,
        UPDATE: departmentActions.UPDATE_DEPARTMENT,
        DELETE: departmentActions.DELETE_DEPARTMENT,
    },
    title: 'Departments',
    singular: 'Department',
    subtitle: 'How your organisation is structured, and who sits where.',
    icon: 'mdi-office-building-outline',
    color: '#0ea5e9',
    employeeField: 'department',
    secondField: 'code',
    namePlaceholder: 'e.g. Engineering',
    emptyText: 'Create departments to group your people and route approvals.',
    blank: { name: '', code: '', description: '' },
    toForm: (d) => ({ name: d.name, code: d.code, description: d.description }),
}

export const DepartmentList = () => <OrgUnitList config={config} />
