# Event System Implementation Guide

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Core Concepts](#core-concepts)
  - [Visibility System](#visibility-system)
  - [Permission System](#permission-system)
  - [Attendance Flow](#attendance-flow)
- [Technical Considerations](#technical-considerations)
  - [Key Components Needed](#key-components-needed)
  - [Edge Cases to Handle](#edge-cases-to-handle)
- [Development Priorities](#development-priorities)
- [Security Considerations](#security-considerations)
- [User Stories](#user-stories)
  - [Public Events](#public-events)
    - [Story 1A: Host Perspective - Creating a Public Event with Capacity](#story-1a-host-perspective---creating-a-public-event-with-capacity)
      - [Scenario: Creating and Managing a Public Event](#scenario-creating-and-managing-a-public-event)
    - [Story 1B: Attendee Perspective - Joining a Public Event](#story-1b-attendee-perspective---joining-a-public-event)
      - [Scenario: Finding and Joining a Public Event](#scenario-finding-and-joining-a-public-event)
  - [Private Group Events](#private-group-events)
    - [Story 2A: Host Perspective - Private Group Event with Approval](#story-2a-host-perspective---private-group-event-with-approval)
      - [Scenario: Managing a Restricted Event](#scenario-managing-a-restricted-event)
    - [Story 2B: Attendee Perspective - Requesting to Join a Group Event](#story-2b-attendee-perspective---requesting-to-join-a-group-event)
      - [Scenario: Applying for a Restricted Event](#scenario-applying-for-a-restricted-event)
  - [Private Invite-Only Events](#private-invite-only-events)
    - [Story 3A: Host Perspective - Private Invite-Only Event](#story-3a-host-perspective---private-invite-only-event)
      - [Scenario: Managing Private Invitations](#scenario-managing-private-invitations)
    - [Story 3B: Attendee Perspective - Attending a Private Event](#story-3b-attendee-perspective---attending-a-private-event)
      - [Scenario: Using a Private Invitation](#scenario-using-a-private-invitation)
- [Detailed User Flow](#detailed-user-flow)
  - [Event Discovery \& Attendance](#event-discovery--attendance)
    - [Interest \& Requirements Phase](#interest--requirements-phase)
    - [Joining Process](#joining-process)
    - [Confirmation Phase](#confirmation-phase)
  - [Flow Classification](#flow-classification)
  - [Notes](#notes)



## Core Concepts

### Visibility System

The visibility system controls both discoverability and access:

1. **Public Events**
   - Indexed in search
   - Basic details always visible
   - Full details visible to authenticated users
   - Must consider:
     - Public vs authenticated access
     - Interaction restrictions
     - Search visibility

2. **Private (Invite-Only) Events**
   - Not indexed in search
   - Only visible via direct link/invitation
   - Must consider:
     - Invitation validation
     - Link sharing security
     - Access control

3. **Private Group Events**
   - Only visible if member of group
   - Must consider:
     - Group membership validation
     - Group permission inheritance
     - Event-specific overrides

### Permission System

1. **Role-Based Access**
   - Host: Full control
   - Organizer: Can manage event details
   - Attendee: Participation rights
   - Pending: Limited access

2. **Guard Requirements**
   - Visibility validation
   - Role verification
   - Action-specific permissions

### Attendance Flow

1. **Pre-Attendance Checks**
   - Group membership validation
   - Capacity limits on attendance
   - Age/location restrictions (advanced feature, post MVP)
   - Custom questionnaire responses (advanced feature, post MVP)

2. **Approval Workflow**
   - Automatic for events with no restrictions
   - Manual review for restricted events
   - Host can communicate with prospective attendees via DM before approval
   - Status notifications to attendees

## Technical Considerations

### Key Components Needed

1. **Visibility Controls**
   - Event visibility settings
   - Access validation
   - Search indexing rules

2. **Permission Management**
   - Role assignment
   - Permission checking
   - Action validation

3. **Attendance Management**
   - Status tracking
   - Capacity management
   - Requirement validation

### Edge Cases to Handle

1. **Visibility Changes**
   - Impact on existing attendees when group goes from public to private
   - Pending request handling
   - Notification requirements

2. **Group Integration**
   - What happens if a user is removed from the group and they are attending a private event?
   - Group deletion impact, what happens to the event, and the attendees?

3. **Capacity Management**
   - Waitlist functionality
   - Approval priorities
   - Cancellation handling

## Development Priorities

1. Core visibility system
2. Basic permission controls
3. Attendance workflow
4. After MVP, advanced features (questionnaires, etc.)

## Security Considerations

1. **Access Control**
   - Proper visibility enforcement
   - Role-based permissions
   - Invitation validation

2. **Data Privacy**
   - Attendee information protection
   - Private event details
   - Group data separation

3. **Action Validation**
   - Permission checking
   - Capacity enforcement
   - Requirement validation

## User Stories

### Public Events

#### Story 1A: Host Perspective - Creating a Public Event with Capacity
**As** a yoga instructor  
**I want** to create a public workshop with limited spots  
**So that** I can manage class size while reaching new students  

##### Scenario: Creating and Managing a Public Event
1. Maria creates a "Beginner Yoga Workshop":
   - Sets visibility as Public
   - Sets capacity to 15 participants
   - Enables automatic approval
   - Sets date, time, location

2. Different users try to join:
   - First 12 users join automatically
   - 13th user joins waitlist
   - Anonymous user can view details but can't register
   - Logged-in user can join waitlist

3. When an attendee cancels:
   - First waitlist person gets notified
   - Has 24 hours to confirm
   - Spot goes to next in line if no response

#### Story 1B: Attendee Perspective - Joining a Public Event
**As** a person interested in yoga  
**I want** to join a beginner's workshop  
**So that** I can learn yoga basics in a structured environment  

##### Scenario: Finding and Joining a Public Event
1. Lisa discovers "Beginner Yoga Workshop":
   - Finds event through search
   - Views basic details without logging in
   - Sees 3 spots remaining
   - Notes automatic approval

2. Lisa attempts to join:
   - Logs in to register
   - Fills in basic registration
   - Gets immediate confirmation
   - Receives event details email

3. Lisa manages her attendance:
   - Can view full event details
   - Sees other attendees
   - Can cancel if needed
   - Gets event reminders

### Private Group Events
#### Story 2A: Host Perspective - Private Group Event with Approval
**As** a photography club organizer  
**I want** to create a members-only event with approval  
**So that** I can ensure participants meet equipment requirements  

##### Scenario: Managing a Restricted Event
1. John creates "Night Sky Photography Session":
   - Sets visibility as Group
   - Enables manual approval
   - Adds equipment requirements as notes
   - Sets capacity to 8 photographers
   - Adds his email for equipment questions

2. Access patterns:
   - Non-group members can't see the event
   - Group members see full details
   - Members must request to join
   - John reviews each request

3. Approval workflow:
   - Members can email John about equipment
   - John discusses requirements via email
   - Approved members get location details
   - Rejected members get explanation

#### Story 2B: Attendee Perspective - Requesting to Join a Group Event
**As** a photography club member  
**I want** to join an advanced photography session  
**So that** I can improve my night photography skills  

##### Scenario: Applying for a Restricted Event
1. David finds "Night Sky Photography Session":
   - Sees event in group calendar
   - Reviews requirements list
   - Notes approval required
   - Sees host email for questions

2. David requests to join:
   - Emails host about equipment questions
   - Discusses requirements with host
   - Submits join request
   - Gets "pending" status

3. After approval:
   - Receives approval notification
   - Gets access to detailed location
   - Can view other attendees
   - Sees preparation instructions

### Private Invite-Only Events

#### Story 3A: Host Perspective - Private Invite-Only Event
**As** a parent  
**I want** to organize a private birthday party  
**So that** only invited families can see and join  

##### Scenario: Managing Private Invitations
1. Sarah creates "Emma's 6th Birthday":
   - Sets visibility as Private
   - Generates shareable links
   - Sets capacity to 12 children
   - Adds parent contact requirement

2. Invitation flow:
   - Invited users can view full details
   - Non-invited users can't find event
   - Each link tracks RSVPs
   - Automatic approval for invitees

3. Management features:
   - Sarah monitors responses
   - Can revoke/add invitations
   - Sends updates to confirmed guests
   - Manages attendance list

#### Story 3B: Attendee Perspective - Attending a Private Event
**As** a parent of Emma's friend  
**I want** to RSVP to a birthday party  
**So that** my child can attend the celebration  

##### Scenario: Using a Private Invitation
1. Rachel receives invitation:
   - Gets private link via email
   - Opens event details
   - Sees party information
   - Notes attendance limit

2. Rachel RSVPs:
   - Confirms attendance
   - Adds child's details
   - Provides contact information
   - Gets immediate confirmation

3. Before the event:
   - Receives location details
   - Gets updates from host
   - Can view other confirmed families
   - Has access to host contact

## Detailed User Flow

### Event Discovery & Attendance
Discovery Phase
Sarah is not logged in and browsing OpenMeet's event listings for photography workshops in her area. She finds
"Urban Photography Walk - Downtown" which is listed as a public event hosted by the Local Photography Club.

The event listing shows:

- Basic details (date, time, location)
- 12 spots remaining out of 20 total

#### Interest & Requirements Phase
Sarah clicks or scrolls to view more details and sees:

- Full event description
- Current attendee list
- Requirements for attendance:

  - Must be a member of Local Photography Club (linked)
  - Must have a DSLR camera (equipment requirement)
  - Requires host approval

#### Joining Process
Sarah joins the Local Photography Club (separate group membership flow)
Returns to event and clicks "Request to Attend"
Fills out attendance questionnaire (if the host created one, otherwise disccuss in DM or email):

- What camera equipment she'll bring
- Her experience level
- Why she wants to attend

Submits request and sees "Pending Host Approval"

#### Confirmation Phase
- Host reviews Sarah's request and her profile
- Host approves Sarah's attendance
- Sarah receives confirmation email with:

  - Final event details
  - Meeting point information
  - What to bring
  - How to contact organizers

### Flow Classification
This story illustrates how the three key aspects interplay:

- Discoverability: Listed (Sarah found it in search)
- Access: Restricted (requires group membership)
- Confirmation: Manual (host approval required)

### Notes

- how to enforce the group membership requirement? Is it automatic or is the host validating that?
- what happens if the host doesn't approve the attendance? What does the user see?